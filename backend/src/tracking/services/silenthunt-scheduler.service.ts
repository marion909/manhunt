import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GamesService } from '../../games/games.service';
import { TrackingService } from '../tracking.service';
import { TrackingGateway } from '../tracking.gateway';
import { RulesService } from '../../rules/rules.service';
import { GeospatialService } from '../../geospatial/geospatial.service';
import { RuleType } from '../../rules/entities/game-rule.entity';
import { Position } from '../entities/position.entity';
import { PingSource } from '../entities/ping.entity';
import { GameStatus } from '../../common/enums/game-status.enum';
import { Role } from '../../common/enums/role.enum';
import { ParticipantStatus } from '../../common/enums/participant-status.enum';
import { BoundaryType } from '../../common/enums';

/**
 * Silenthunt Scheduler
 * 
 * Runs every full hour (0:00, 1:00, 2:00, etc.)
 * For each active game with SILENTHUNT rule enabled:
 * - Check if current hour matches the configured interval for inner/outer zone
 * - Skip players with active Regeneration
 * - Generate pings for eligible players
 * 
 * Config format:
 * {
 *   innerZoneIntervalHours: 1,  // Manhattan Zone: Ping every 1 hour (Rulebook)
 *   outerZoneIntervalHours: 2,  // Outer Area: Ping every 2 hours (Rulebook)
 * }
 */
@Injectable()
export class SilenthuntSchedulerService {
  private readonly logger = new Logger(SilenthuntSchedulerService.name);

  constructor(
    private readonly gamesService: GamesService,
    private readonly trackingService: TrackingService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly trackingGateway: TrackingGateway,
    private readonly rulesService: RulesService,
    private readonly geospatialService: GeospatialService,
    @InjectRepository(Position)
    private positionRepository: Repository<Position>,
  ) {}

  /**
   * Cron job that runs every full hour
   * '0 * * * *' = at minute 0 of every hour
   * TEMPORARY: '* * * * *' = every minute for testing
   */
  @Cron('* * * * *')
  async handleSilenthuntPings(): Promise<void> {
    const currentHour = new Date().getHours();
    this.logger.log(`Silenthunt check at hour ${currentHour}`);

    try {
      // Get all active games
      const activeGames = await this.gamesService.findActiveGames();
      
      for (const game of activeGames) {
        await this.processSilenthuntForGame(game.id, currentHour);
      }
    } catch (error) {
      this.logger.error(`Silenthunt scheduler error: ${error.message}`, error.stack);
    }
  }

  /**
   * Cron job that runs every minute to check for expired Hotel-Bonus
   * When Hotel-Bonus expires (6h), it triggers an automatic ping (Rulebook)
   * '* * * * *' = every minute
   */
  @Cron('* * * * *')
  async handleHotelBonusExpiry(): Promise<void> {
    try {
      // Get all active games
      const activeGames = await this.gamesService.findActiveGames();
      
      for (const game of activeGames) {
        await this.processHotelBonusExpiry(game.id);
      }
    } catch (error) {
      this.logger.error(`Hotel-Bonus expiry check error: ${error.message}`, error.stack);
    }
  }

  /**
   * Process expired Hotel-Bonuses for a game
   * Deactivates expired bonuses and triggers automatic pings
   */
  private async processHotelBonusExpiry(gameId: string): Promise<void> {
    // Get expired but still active Hotel-Bonuses
    const expiredBonuses = await this.rulesService.getExpiredHotelBonuses(gameId);
    
    if (expiredBonuses.length === 0) {
      return;
    }

    // Get SILENTHUNT config for ping radius
    const silenthuntRule = await this.rulesService.findByGameAndType(gameId, RuleType.SILENTHUNT);
    const pingRadius = silenthuntRule?.config?.pingRadius || 100;

    for (const bonus of expiredBonuses) {
      try {
        // Deactivate the bonus
        await this.rulesService.deactivateExpiredHotelBonuses(gameId);
        
        // Trigger automatic ping for this player (Rulebook: ping on Hotel-Bonus expiry)
        // Use SILENTHUNT source since Hotel-Bonus is part of Silenthunt mechanic
        const ping = await this.trackingService.generatePing(gameId, bonus.participantId, pingRadius, 0, PingSource.SILENTHUNT);
        
        if (ping) {
          this.trackingGateway.broadcastPing(gameId, ping);
          this.logger.log(`Hotel-Bonus expired for player ${bonus.participantId}, auto-ping generated`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to process Hotel-Bonus expiry for player ${bonus.participantId}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Process Silenthunt for a single game
   */
  private async processSilenthuntForGame(gameId: string, currentHour: number): Promise<void> {
    // Check if SILENTHUNT rule is enabled for this game
    const silenthuntRule = await this.rulesService.findByGameAndType(gameId, RuleType.SILENTHUNT);
    
    if (!silenthuntRule || !silenthuntRule.isEnabled) {
      return;
    }

    const config = silenthuntRule.config || {};
    const innerZoneIntervalHours = config.innerZoneIntervalHours || 1; // Manhattan Zone: 1h (Rulebook)
    const outerZoneIntervalHours = config.outerZoneIntervalHours || 2; // Outer Area: 2h (Rulebook)
    const pingRadius = config.pingRadius || 100; // Default 100m precision

    this.logger.debug(
      `Processing Silenthunt for game ${gameId}: innerInterval=${innerZoneIntervalHours}h, outerInterval=${outerZoneIntervalHours}h, radius=${pingRadius}m`,
    );

    // Get all active players in the game
    const game = await this.gamesService.findOne(gameId, null);
    if (!game || game.status !== GameStatus.ACTIVE) {
      return;
    }

    const players = game.participants.filter(
      (p) => p.role === Role.PLAYER && p.status === ParticipantStatus.ACTIVE,
    );

    let pingedCount = 0;

    for (const player of players) {
      try {
        const shouldPing = await this.shouldPingPlayer(
          player.id,
          gameId,
          currentHour,
          innerZoneIntervalHours,
          outerZoneIntervalHours,
        );

        if (shouldPing) {
          const ping = await this.trackingService.generatePing(gameId, player.id, pingRadius, 0, PingSource.SILENTHUNT);
          pingedCount++;
          this.logger.debug(`Silenthunt ping generated for player ${player.id} with radius ${pingRadius}m`);
          
          // Broadcast ping via WebSocket to all clients in the game
          if (ping) {
            this.trackingGateway.broadcastPing(gameId, ping);
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to process Silenthunt for player ${player.id}: ${error.message}`,
        );
      }
    }

    if (pingedCount > 0) {
      this.logger.log(`Silenthunt: Generated ${pingedCount} pings for game ${gameId}`);
    }
  }

  /**
   * Determine if a player should be pinged this hour
   */
  private async shouldPingPlayer(
    participantId: string,
    gameId: string,
    currentHour: number,
    innerIntervalHours: number,
    outerIntervalHours: number,
  ): Promise<boolean> {
    // Check for active Regeneration
    const hasRegeneration = await this.rulesService.hasActiveRegeneration(participantId);
    if (hasRegeneration) {
      this.logger.debug(`Player ${participantId} has active Regeneration, skipping`);
      return false;
    }

    // Check for active Hotel-Bonus (Rulebook: 6h protection from pings)
    const hasHotelBonus = await this.rulesService.hasActiveHotelBonus(participantId);
    if (hasHotelBonus) {
      this.logger.debug(`Player ${participantId} has active Hotel-Bonus, skipping`);
      return false;
    }

    // Get player's last known position
    const lastPosition = await this.positionRepository.findOne({
      where: { participantId },
      order: { timestamp: 'DESC' },
    });

    if (!lastPosition) {
      // No position data, skip for now
      this.logger.debug(`Player ${participantId} has no position data, skipping`);
      return false;
    }

    // Determine which zone the player is in
    const zone = await this.geospatialService.getPointZone(lastPosition.location, gameId);

    if (!zone) {
      // Player is outside game area
      this.logger.debug(`Player ${participantId} is outside game area`);
      return false;
    }

    // Determine interval based on zone
    const intervalHours = zone === BoundaryType.INNER_ZONE ? innerIntervalHours : outerIntervalHours;

    // TEMPORARY: Always ping for testing (ignore interval)
    const shouldPing = true;
    // Check if current hour is a ping hour (starting from 0:00)
    // e.g., interval=2 -> ping at 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22
    // e.g., interval=4 -> ping at 0, 4, 8, 12, 16, 20
    // const shouldPing = currentHour % intervalHours === 0;

    this.logger.debug(
      `Player ${participantId} in ${zone}, interval=${intervalHours}h, hour=${currentHour}, shouldPing=${shouldPing}`,
    );

    return shouldPing;
  }
}
