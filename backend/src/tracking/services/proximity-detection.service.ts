import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import { Position } from '../entities/position.entity';
import { GamesService } from '../../games/games.service';
import { EventsService } from '../../events/events.service';
import { TrackingGateway } from '../tracking.gateway';
import { EventType, EventSeverity, Role, ParticipantStatus } from '../../common/enums';
import { GameStatus } from '../../common/enums/game-status.enum';
import { Inject, forwardRef } from '@nestjs/common';

/**
 * Proximity Detection Service
 * 
 * Rulebook: Alert players when hunters are nearby.
 * This service monitors the distance between hunters and players
 * and sends alerts when they get within a configurable distance.
 */
@Injectable()
export class ProximityDetectionService {
  private readonly logger = new Logger(ProximityDetectionService.name);
  
  // Default proximity thresholds
  private readonly DANGER_ZONE_METERS = 200; // Close proximity
  private readonly WARNING_ZONE_METERS = 500; // Moderate proximity
  
  // Alert cooldown to avoid spam
  private alertCooldowns: Map<string, Date> = new Map();
  private readonly ALERT_COOLDOWN_SECONDS = 60;

  constructor(
    @InjectRepository(Position)
    private positionRepository: Repository<Position>,
    @InjectRepository(GameParticipant)
    private participantRepository: Repository<GameParticipant>,
    private gamesService: GamesService,
    private eventsService: EventsService,
    @Inject(forwardRef(() => TrackingGateway))
    private trackingGateway: TrackingGateway,
  ) {}

  /**
   * Cron job that runs every 30 seconds to check proximity
   */
  @Cron('*/30 * * * * *')
  async checkProximity(): Promise<void> {
    try {
      const activeGames = await this.gamesService.findActiveGames();
      
      for (const game of activeGames) {
        await this.checkGameProximity(game.id);
      }
    } catch (error) {
      this.logger.error(`Proximity check error: ${error.message}`, error.stack);
    }
  }

  /**
   * Check proximity between hunters and players in a game
   */
  private async checkGameProximity(gameId: string): Promise<void> {
    const game = await this.gamesService.findOne(gameId, null);
    if (!game || game.status !== GameStatus.ACTIVE) {
      return;
    }

    // Get proximity config from game settings or use defaults
    const dangerZone = game.proximityDangerMeters || this.DANGER_ZONE_METERS;
    const warningZone = game.proximityWarningMeters || this.WARNING_ZONE_METERS;

    const hunters = game.participants.filter(
      (p) => p.role === Role.HUNTER && p.status === ParticipantStatus.ACTIVE,
    );

    const players = game.participants.filter(
      (p) => p.role === Role.PLAYER && p.status === ParticipantStatus.ACTIVE,
    );

    // Get latest positions for all participants
    const hunterPositions = await this.getLatestPositions(gameId, hunters);
    const playerPositions = await this.getLatestPositions(gameId, players);

    // Check each player against each hunter
    for (const [playerId, playerPos] of playerPositions) {
      let closestHunterDistance = Infinity;
      let closestHunterId: string | null = null;

      for (const [hunterId, hunterPos] of hunterPositions) {
        const distance = this.calculateDistance(
          playerPos.lat,
          playerPos.lng,
          hunterPos.lat,
          hunterPos.lng,
        );

        if (distance < closestHunterDistance) {
          closestHunterDistance = distance;
          closestHunterId = hunterId;
        }
      }

      // Determine alert level
      if (closestHunterDistance <= dangerZone) {
        await this.sendProximityAlert(
          gameId,
          playerId,
          closestHunterId!,
          closestHunterDistance,
          'DANGER',
        );
      } else if (closestHunterDistance <= warningZone) {
        await this.sendProximityAlert(
          gameId,
          playerId,
          closestHunterId!,
          closestHunterDistance,
          'WARNING',
        );
      }
    }
  }

  /**
   * Get latest positions for a list of participants
   */
  private async getLatestPositions(
    gameId: string,
    participants: GameParticipant[],
  ): Promise<Map<string, { lat: number; lng: number; timestamp: Date }>> {
    const positions = new Map<string, { lat: number; lng: number; timestamp: Date }>();

    for (const participant of participants) {
      const position = await this.positionRepository.findOne({
        where: { gameId, participantId: participant.id },
        order: { timestamp: 'DESC' },
      });

      if (position) {
        positions.set(participant.id, {
          lat: position.location.coordinates[1],
          lng: position.location.coordinates[0],
          timestamp: position.timestamp,
        });
      }
    }

    return positions;
  }

  /**
   * Send proximity alert to a player
   */
  private async sendProximityAlert(
    gameId: string,
    playerId: string,
    hunterId: string,
    distance: number,
    level: 'DANGER' | 'WARNING',
  ): Promise<void> {
    // Check cooldown
    const cooldownKey = `${playerId}-${level}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    const now = new Date();

    if (lastAlert && (now.getTime() - lastAlert.getTime()) < this.ALERT_COOLDOWN_SECONDS * 1000) {
      return; // Still in cooldown
    }

    this.alertCooldowns.set(cooldownKey, now);

    const player = await this.participantRepository.findOne({
      where: { id: playerId },
      relations: ['user'],
    });

    if (!player) return;

    this.logger.log(
      `Proximity ${level}: Player ${player.displayName} - hunter within ${Math.round(distance)}m`,
    );

    // Log event
    await this.eventsService.logEvent({
      gameId,
      userId: player.userId,
      type: EventType.POSITION_UPDATE,
      severity: level === 'DANGER' ? EventSeverity.CRITICAL : EventSeverity.WARNING,
      message: `Hunter within ${Math.round(distance)}m - ${level} zone`,
      metadata: {
        playerId,
        hunterId,
        distance: Math.round(distance),
        alertLevel: level,
      },
    });

    // Send WebSocket notification to player
    // This would be handled by the TrackingGateway's notification system
    this.trackingGateway.sendProximityAlert(gameId, playerId, {
      level,
      distance: Math.round(distance),
      message: level === 'DANGER' 
        ? `DANGER: Hunter very close (${Math.round(distance)}m)!` 
        : `WARNING: Hunter nearby (${Math.round(distance)}m)`,
    });
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
}
