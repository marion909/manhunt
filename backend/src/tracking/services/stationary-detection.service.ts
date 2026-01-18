import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import { Position } from '../entities/position.entity';
import { GamesService } from '../../games/games.service';
import { EventsService } from '../../events/events.service';
import { EventType, EventSeverity, Role, ParticipantStatus } from '../../common/enums';
import { GameStatus } from '../../common/enums/game-status.enum';

/**
 * Stationary Detection Service
 * 
 * Rulebook: Detects when a player is stationary (private area detection).
 * If a player hasn't moved significantly for a configured time,
 * they are considered to be in a "private area" and may receive
 * different treatment (e.g., automatic pings pause).
 * 
 * Uses GPS-based analysis:
 * - Checks position variance over time
 * - If variance is below threshold, player is considered stationary
 */
@Injectable()
export class StationaryDetectionService {
  private readonly logger = new Logger(StationaryDetectionService.name);
  
  // Configuration
  private readonly STATIONARY_THRESHOLD_METERS = 50; // Movement under 50m = stationary
  private readonly STATIONARY_WINDOW_MINUTES = 30; // Check over 30-minute window
  private readonly CHECK_INTERVAL_MINUTES = 5; // How often to check

  // Cache for stationary status
  // Key: participantId, Value: { isStationary: boolean, since: Date }
  private stationaryStatus: Map<string, {
    isStationary: boolean;
    since: Date;
    lastPosition?: { lat: number; lng: number };
  }> = new Map();

  constructor(
    @InjectRepository(Position)
    private positionRepository: Repository<Position>,
    @InjectRepository(GameParticipant)
    private participantRepository: Repository<GameParticipant>,
    private gamesService: GamesService,
    private eventsService: EventsService,
  ) {}

  /**
   * Cron job that runs every 5 minutes to check for stationary players
   */
  @Cron('*/5 * * * *')
  async checkStationaryPlayers(): Promise<void> {
    try {
      const activeGames = await this.gamesService.findActiveGames();
      
      for (const game of activeGames) {
        await this.checkGameStationaryPlayers(game.id);
      }
    } catch (error) {
      this.logger.error(`Stationary check error: ${error.message}`, error.stack);
    }
  }

  /**
   * Check for stationary players in a game
   */
  private async checkGameStationaryPlayers(gameId: string): Promise<void> {
    const game = await this.gamesService.findOne(gameId, null);
    if (!game || game.status !== GameStatus.ACTIVE) {
      return;
    }

    const players = game.participants.filter(
      (p) => p.role === Role.PLAYER && p.status === ParticipantStatus.ACTIVE,
    );

    for (const player of players) {
      try {
        await this.checkPlayerStationary(gameId, player);
      } catch (error) {
        this.logger.error(
          `Failed to check stationary for player ${player.id}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Check if a player is stationary based on position history
   */
  private async checkPlayerStationary(
    gameId: string,
    player: GameParticipant,
  ): Promise<void> {
    const windowStart = new Date(Date.now() - this.STATIONARY_WINDOW_MINUTES * 60 * 1000);

    // Get positions from the time window
    const positions = await this.positionRepository.find({
      where: {
        gameId,
        participantId: player.id,
        timestamp: MoreThan(windowStart),
      },
      order: { timestamp: 'ASC' },
    });

    if (positions.length < 3) {
      // Not enough data points
      return;
    }

    // Calculate maximum distance from first position
    const firstPos = positions[0].location;
    let maxDistance = 0;

    for (const pos of positions) {
      const distance = this.calculateDistance(
        firstPos.coordinates[1],
        firstPos.coordinates[0],
        pos.location.coordinates[1],
        pos.location.coordinates[0],
      );
      maxDistance = Math.max(maxDistance, distance);
    }

    const wasStationary = this.stationaryStatus.get(player.id)?.isStationary || false;
    const isNowStationary = maxDistance < this.STATIONARY_THRESHOLD_METERS;

    if (isNowStationary && !wasStationary) {
      // Player became stationary
      this.stationaryStatus.set(player.id, {
        isStationary: true,
        since: new Date(),
        lastPosition: {
          lat: firstPos.coordinates[1],
          lng: firstPos.coordinates[0],
        },
      });

      this.logger.log(`Player ${player.displayName} is now stationary (private area detected)`);

      await this.eventsService.logEvent({
        gameId,
        userId: player.userId,
        type: EventType.POSITION_UPDATE,
        severity: EventSeverity.INFO,
        message: `Player entered private area (stationary)`,
        metadata: {
          participantId: player.id,
          maxMovement: maxDistance,
          isStationary: true,
        },
      });
    } else if (!isNowStationary && wasStationary) {
      // Player started moving again
      const status = this.stationaryStatus.get(player.id);
      const stationaryDuration = status ? Date.now() - status.since.getTime() : 0;

      this.stationaryStatus.set(player.id, {
        isStationary: false,
        since: new Date(),
      });

      this.logger.log(
        `Player ${player.displayName} left private area after ${Math.round(stationaryDuration / 60000)} minutes`,
      );

      await this.eventsService.logEvent({
        gameId,
        userId: player.userId,
        type: EventType.POSITION_UPDATE,
        severity: EventSeverity.INFO,
        message: `Player left private area (moving again)`,
        metadata: {
          participantId: player.id,
          stationaryDurationMinutes: Math.round(stationaryDuration / 60000),
          isStationary: false,
        },
      });
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get stationary status for a player
   */
  getStationaryStatus(participantId: string): {
    isStationary: boolean;
    since?: Date;
    durationMinutes?: number;
  } | null {
    const status = this.stationaryStatus.get(participantId);
    if (!status) {
      return null;
    }

    return {
      isStationary: status.isStationary,
      since: status.since,
      durationMinutes: Math.round((Date.now() - status.since.getTime()) / 60000),
    };
  }

  /**
   * Check if a player is currently stationary (for ping skip logic)
   */
  isPlayerStationary(participantId: string): boolean {
    return this.stationaryStatus.get(participantId)?.isStationary || false;
  }
}
