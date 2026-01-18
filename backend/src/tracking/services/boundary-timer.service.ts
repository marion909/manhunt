import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import { Position } from '../entities/position.entity';
import { GeospatialService } from '../../geospatial/geospatial.service';
import { EventsService } from '../../events/events.service';
import { GamesService } from '../../games/games.service';
import { EventType, EventSeverity, Role, ParticipantStatus } from '../../common/enums';
import { GameStatus } from '../../common/enums/game-status.enum';

/**
 * Boundary Timer Service
 * 
 * Rulebook: Players must stay within game boundaries.
 * If a player leaves the boundary, a timer starts.
 * After the configured time (default 15 minutes), the player is eliminated.
 * 
 * This service:
 * - Checks player positions every minute
 * - Tracks time spent outside boundaries
 * - Alerts players approaching the limit
 * - Eliminates players exceeding the limit
 */
@Injectable()
export class BoundaryTimerService {
  private readonly logger = new Logger(BoundaryTimerService.name);
  
  // In-memory storage for boundary violation timers
  // Key: participantId, Value: { startTime: Date, totalSeconds: number, isCurrentlyOutside: boolean }
  private violationTimers: Map<string, {
    startTime: Date;
    totalSeconds: number;
    isCurrentlyOutside: boolean;
    lastAlertAt?: Date;
  }> = new Map();

  constructor(
    @InjectRepository(GameParticipant)
    private participantRepository: Repository<GameParticipant>,
    @InjectRepository(Position)
    private positionRepository: Repository<Position>,
    private geospatialService: GeospatialService,
    private eventsService: EventsService,
    private gamesService: GamesService,
  ) {}

  /**
   * Cron job that runs every minute to check player boundary violations
   */
  @Cron('* * * * *')
  async checkBoundaryViolations(): Promise<void> {
    try {
      const activeGames = await this.gamesService.findActiveGames();
      
      for (const game of activeGames) {
        await this.checkGameBoundaryViolations(game.id);
      }
    } catch (error) {
      this.logger.error(`Boundary check error: ${error.message}`, error.stack);
    }
  }

  /**
   * Check boundary violations for all players in a game
   */
  private async checkGameBoundaryViolations(gameId: string): Promise<void> {
    const game = await this.gamesService.findOne(gameId, null);
    if (!game || game.status !== GameStatus.ACTIVE) {
      return;
    }

    // Get boundary timer config (default 15 minutes = 900 seconds)
    const maxOutsideSeconds = game.boundaryViolationLimitSeconds || 900;
    const alertThresholdSeconds = maxOutsideSeconds * 0.75; // Alert at 75% of limit

    const players = game.participants.filter(
      (p) => p.role === Role.PLAYER && p.status === ParticipantStatus.ACTIVE,
    );

    for (const player of players) {
      try {
        await this.checkPlayerBoundary(
          gameId,
          player,
          maxOutsideSeconds,
          alertThresholdSeconds,
        );
      } catch (error) {
        this.logger.error(
          `Failed to check boundary for player ${player.id}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Check if a player is outside boundaries and update their timer
   */
  private async checkPlayerBoundary(
    gameId: string,
    player: GameParticipant,
    maxOutsideSeconds: number,
    alertThresholdSeconds: number,
  ): Promise<void> {
    // Get player's latest position
    const position = await this.positionRepository.findOne({
      where: { gameId, participantId: player.id },
      order: { timestamp: 'DESC' },
    });

    if (!position) {
      return; // No position data
    }

    // Check if player is inside game area
    const isInside = await this.geospatialService.isPointInGameArea(
      position.location,
      gameId,
    );

    const now = new Date();
    let timer = this.violationTimers.get(player.id);

    if (!isInside) {
      // Player is OUTSIDE boundaries
      if (!timer) {
        // Start new timer
        timer = {
          startTime: now,
          totalSeconds: 0,
          isCurrentlyOutside: true,
        };
        this.violationTimers.set(player.id, timer);
        
        this.logger.warn(`Player ${player.displayName} left game boundary`);
        
        await this.eventsService.logEvent({
          gameId,
          userId: player.userId,
          type: EventType.BOUNDARY_VIOLATION,
          severity: EventSeverity.WARNING,
          message: `Player left game boundary`,
          metadata: {
            participantId: player.id,
            location: position.location,
          },
        });
      } else if (!timer.isCurrentlyOutside) {
        // Player re-exited after being inside
        timer.startTime = now;
        timer.isCurrentlyOutside = true;
      }

      // Calculate total time outside
      const currentOutsideSeconds = (now.getTime() - timer.startTime.getTime()) / 1000;
      const totalOutside = timer.totalSeconds + currentOutsideSeconds;

      // Check if exceeded limit
      if (totalOutside >= maxOutsideSeconds) {
        await this.eliminatePlayer(gameId, player, totalOutside);
        this.violationTimers.delete(player.id);
        return;
      }

      // Check if should send alert (at 75% and every 2 minutes after)
      if (totalOutside >= alertThresholdSeconds) {
        const shouldAlert = !timer.lastAlertAt || 
          (now.getTime() - timer.lastAlertAt.getTime()) > 120000; // 2 minutes

        if (shouldAlert) {
          const remainingSeconds = maxOutsideSeconds - totalOutside;
          await this.alertPlayer(gameId, player, remainingSeconds);
          timer.lastAlertAt = now;
        }
      }
    } else {
      // Player is INSIDE boundaries
      if (timer && timer.isCurrentlyOutside) {
        // Accumulate time and mark as inside
        const outsideSeconds = (now.getTime() - timer.startTime.getTime()) / 1000;
        timer.totalSeconds += outsideSeconds;
        timer.isCurrentlyOutside = false;
        
        this.logger.log(
          `Player ${player.displayName} returned to boundary. Total outside: ${Math.round(timer.totalSeconds)}s`,
        );
      }
      // If timer exists and player has been inside for 5+ minutes, reduce accumulated time
      if (timer && !timer.isCurrentlyOutside && timer.totalSeconds > 0) {
        // Recover 1 second for every 3 seconds inside (slow recovery)
        timer.totalSeconds = Math.max(0, timer.totalSeconds - 1/3);
        
        if (timer.totalSeconds <= 0) {
          this.violationTimers.delete(player.id);
        }
      }
    }
  }

  /**
   * Eliminate a player for exceeding boundary time
   */
  private async eliminatePlayer(
    gameId: string,
    player: GameParticipant,
    totalOutsideSeconds: number,
  ): Promise<void> {
    this.logger.warn(
      `Eliminating player ${player.displayName} for boundary violation (${Math.round(totalOutsideSeconds)}s outside)`,
    );

    // Update player status
    player.status = ParticipantStatus.DISQUALIFIED;
    await this.participantRepository.save(player);

    // Log event
    await this.eventsService.logEvent({
      gameId,
      userId: player.userId,
      type: EventType.PLAYER_ELIMINATED,
      severity: EventSeverity.CRITICAL,
      message: `Player eliminated for exceeding boundary time limit`,
      metadata: {
        participantId: player.id,
        reason: 'BOUNDARY_VIOLATION',
        totalOutsideSeconds: Math.round(totalOutsideSeconds),
      },
    });
  }

  /**
   * Send alert to player about remaining time
   */
  private async alertPlayer(
    gameId: string,
    player: GameParticipant,
    remainingSeconds: number,
  ): Promise<void> {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = Math.round(remainingSeconds % 60);

    this.logger.warn(
      `Alert: Player ${player.displayName} has ${minutes}m ${seconds}s to return to boundary`,
    );

    await this.eventsService.logEvent({
      gameId,
      userId: player.userId,
      type: EventType.BOUNDARY_WARNING,
      severity: EventSeverity.WARNING,
      message: `Return to game area within ${minutes}m ${seconds}s or be eliminated`,
      metadata: {
        participantId: player.id,
        remainingSeconds: Math.round(remainingSeconds),
      },
    });
  }

  /**
   * Get boundary violation status for a player
   */
  getBoundaryStatus(participantId: string): {
    isViolating: boolean;
    totalOutsideSeconds: number;
    currentlyOutside: boolean;
  } | null {
    const timer = this.violationTimers.get(participantId);
    if (!timer) {
      return null;
    }

    let totalSeconds = timer.totalSeconds;
    if (timer.isCurrentlyOutside) {
      totalSeconds += (Date.now() - timer.startTime.getTime()) / 1000;
    }

    return {
      isViolating: timer.isCurrentlyOutside,
      totalOutsideSeconds: totalSeconds,
      currentlyOutside: timer.isCurrentlyOutside,
    };
  }

  /**
   * Reset boundary timer for a player (e.g., after orga override)
   */
  resetBoundaryTimer(participantId: string): void {
    this.violationTimers.delete(participantId);
  }
}
