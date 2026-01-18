import { Injectable, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, In } from 'typeorm';
import { Position } from './entities/position.entity';
import { Ping, PingSource } from './entities/ping.entity';
import { PositionUpdateDto } from './dto/position-update.dto';
import { GeospatialService } from '../geospatial/geospatial.service';
import { GamesService } from '../games/games.service';
import { EventsService } from '../events/events.service';
import { Role } from '../common/enums';
import { EventType } from '../common/enums/event-type.enum';
import { Point } from 'geojson';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(Position)
    private positionsRepository: Repository<Position>,
    @InjectRepository(Ping)
    private pingsRepository: Repository<Ping>,
    private geospatialService: GeospatialService,
    @Inject(forwardRef(() => GamesService))
    private gamesService: GamesService,
    private eventsService: EventsService,
  ) {}

  async savePosition(
    gameId: string,
    participantId: string,
    positionDto: PositionUpdateDto,
  ): Promise<Position> {
    const point: Point = {
      type: 'Point',
      coordinates: [positionDto.longitude, positionDto.latitude],
    };

    const position = this.positionsRepository.create({
      gameId,
      participantId,
      location: point,
      accuracy: positionDto.accuracy,
      altitude: positionDto.altitude,
      speed: positionDto.speed,
      heading: positionDto.heading,
      timestamp: new Date(),
      isEmergency: positionDto.isEmergency || false,
    });

    return this.positionsRepository.save(position);
  }

  async getLatestPosition(gameId: string, participantId: string): Promise<Position | null> {
    return this.positionsRepository.findOne({
      where: { gameId, participantId },
      order: { timestamp: 'DESC' },
    });
  }

  async getHunterPositions(gameId: string): Promise<any[]> {
    // Get all latest positions for HUNTERS ONLY in the game
    const result = await this.positionsRepository.query(`
      SELECT DISTINCT ON (p."participant_id")
        p.id,
        p.game_id as "gameId",
        p.participant_id as "participantId",
        ST_AsGeoJSON(p.location)::json as location,
        p.accuracy,
        p.altitude,
        p.speed,
        p.heading,
        p.timestamp,
        p.is_emergency as "isEmergency",
        gp.role,
        gp.display_name as "displayName",
        gp.participant_number as "participantNumber"
      FROM positions p
      LEFT JOIN game_participants gp ON gp.id = p.participant_id
      WHERE p.game_id = $1 AND gp.role = 'hunter'
      ORDER BY p.participant_id ASC, p.timestamp DESC
    `, [gameId]);

    return result.map((row: any) => ({
      id: row.id,
      gameId: row.gameId,
      participantId: row.participantId,
      location: row.location,
      accuracy: row.accuracy,
      altitude: row.altitude,
      speed: row.speed,
      heading: row.heading,
      timestamp: row.timestamp,
      isEmergency: row.isEmergency,
      role: row.role || 'HUNTER',
      displayName: row.displayName || `Participant #${row.participantNumber || '?'}`,
      participantNumber: row.participantNumber,
    }));
  }

  async getPlayerPings(gameId: string): Promise<Ping[]> {
    // Get pings from last 24 hours (regardless of reveal status for debugging)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.pingsRepository.find({
      where: {
        gameId,
        timestamp: MoreThan(oneDayAgo),
      },
      relations: ['participant'],
      order: { timestamp: 'DESC' },
    });
  }

  async getPlayerPingsFiltered(
    gameId: string,
    options: {
      participantIds?: string[];
      since?: Date;
      limit?: number;
      sources?: PingSource[];
      includeFake?: boolean;
      roles?: string[];
    },
  ): Promise<Ping[]> {
    const { participantIds, since, limit = 100, sources, includeFake = true, roles } = options;

    const queryBuilder = this.pingsRepository
      .createQueryBuilder('ping')
      .leftJoinAndSelect('ping.participant', 'participant')
      .where('ping.gameId = :gameId', { gameId });

    if (participantIds && participantIds.length > 0) {
      queryBuilder.andWhere('ping.participantId IN (:...participantIds)', { participantIds });
    }

    if (roles && roles.length > 0) {
      queryBuilder.andWhere('participant.role IN (:...roles)', { roles: roles.map(r => r.toLowerCase()) });
    }

    if (sources && sources.length > 0) {
      queryBuilder.andWhere('ping.source IN (:...sources)', { sources });
    }

    if (!includeFake) {
      queryBuilder.andWhere('ping.isFake = false');
    }

    if (since) {
      queryBuilder.andWhere('ping.timestamp > :since', { since });
    } else {
      // Default: last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      queryBuilder.andWhere('ping.timestamp > :oneDayAgo', { oneDayAgo });
    }

    queryBuilder.orderBy('ping.timestamp', 'DESC').take(limit);

    return queryBuilder.getMany();
  }

  async generatePing(
    gameId: string,
    participantId: string,
    radiusMeters: number = 200,
    revealDelaySeconds: number = 0,
    source: PingSource = PingSource.PERIODIC,
  ): Promise<Ping> {
    // Get player's current position
    const position = await this.getLatestPosition(gameId, participantId);
    if (!position) {
      throw new Error('No position available for player');
    }

    const actualPoint: Point = position.location;

    // Use actual location directly (no random offset)
    const revealedPoint = actualPoint;

    // Calculate reveal time (Rulebook: Speedhunt pings are time-delayed)
    const revealAt = revealDelaySeconds > 0
      ? new Date(Date.now() + revealDelaySeconds * 1000)
      : new Date();

    const ping = this.pingsRepository.create({
      gameId,
      participantId,
      actualLocation: actualPoint,
      revealedLocation: revealedPoint,
      radiusMeters: 0,
      timestamp: new Date(),
      revealedAt: revealAt,
      source,
      isFake: false,
    });

    const savedPing = await this.pingsRepository.save(ping);
    
    // Reload with participant relation for proper display name
    return this.pingsRepository.findOne({
      where: { id: savedPing.id },
      relations: ['participant'],
    });
  }

  /**
   * Generate a fake ping at a specified location (Rulebook: Fake-Ping joker)
   * This is triggered by the player using their one-time Fake-Ping joker
   */
  async generateFakePing(
    gameId: string,
    participantId: string,
    fakeLat: number,
    fakeLng: number,
  ): Promise<Ping> {
    const fakePoint: Point = {
      type: 'Point',
      coordinates: [fakeLng, fakeLat],
    };

    const ping = this.pingsRepository.create({
      gameId,
      participantId,
      actualLocation: fakePoint, // Store fake as both actual and revealed
      revealedLocation: fakePoint,
      radiusMeters: 0,
      timestamp: new Date(),
      revealedAt: new Date(), // Immediate reveal
      source: PingSource.FAKE_PING,
      isFake: true,
      metadata: {
        isFake: true,
        source: 'FAKE_PING_JOKER',
      },
    });

    const savedPing = await this.pingsRepository.save(ping);
    
    // Reload with participant relation for proper display name
    return this.pingsRepository.findOne({
      where: { id: savedPing.id },
      relations: ['participant'],
    });
  }

  async checkBoundaryViolation(gameId: string, userId: string): Promise<boolean> {
    const position = await this.getLatestPosition(gameId, userId);
    if (!position) return false;

    return !(await this.geospatialService.isPointInGameArea(position.location, gameId));
  }

  async getPositionHistory(
    gameId: string,
    participantId: string,
    limit: number = 100,
  ): Promise<Position[]> {
    return this.positionsRepository.find({
      where: { gameId, participantId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async triggerPanic(gameId: string, userId: string, location: Point) {
    // Verify user is a player in this game
    const game = await this.gamesService.findOne(gameId, userId);
    const participant = game.participants.find((p) => p.userId === userId);

    if (!participant || participant.role !== Role.PLAYER) {
      throw new ForbiddenException('Only players can trigger panic alerts');
    }

    // Save panic position
    const panicPosition = this.positionsRepository.create({
      gameId,
      participantId: userId,
      location,
      timestamp: new Date(),
      isEmergency: true,
    });
    await this.positionsRepository.save(panicPosition);

    // Log panic event
    await this.eventsService.logEvent({
      gameId,
      userId,
      type: EventType.PANIC_BUTTON,
      severity: 'CRITICAL' as any,
      message: `${participant.user.fullName || participant.user.email} hat einen Notruf ausgelöst`,
      metadata: { location },
    });

    return {
      success: true,
      timestamp: panicPosition.timestamp,
      message: 'Panic alert triggered - staff has been notified',
    };
  }

  async overridePosition(
    gameId: string,
    targetUserId: string,
    location: { latitude: number; longitude: number },
    executorId: string,
  ): Promise<Position> {
    // Start transaction with pessimistic write lock
    return await this.positionsRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Lock game record to prevent race conditions
        const game = await transactionalEntityManager
          .getRepository('games')
          .createQueryBuilder('game')
          .setLock('pessimistic_write')
          .where('game.id = :gameId', { gameId })
          .getOne();

        if (!game) {
          throw new NotFoundException('Game not found');
        }

        // Verify executor has permission (ORGA or OPERATOR)
        const executorParticipant = await transactionalEntityManager
          .getRepository('game_participants')
          .findOne({
            where: { userId: executorId, gameId },
          });

        if (
          !executorParticipant ||
          (executorParticipant.role !== Role.ORGA &&
            executorParticipant.role !== Role.OPERATOR)
        ) {
          throw new ForbiddenException(
            'Only ORGA/OPERATOR can override positions',
          );
        }

        // Get target participant info for logging
        const targetParticipant = await transactionalEntityManager
          .getRepository('game_participants')
          .findOne({
            where: { userId: targetUserId, gameId },
            relations: ['user'],
          });

        if (!targetParticipant) {
          throw new NotFoundException('Target participant not found');
        }

        // Create position with override flag
        const point: Point = {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        };

        const position = transactionalEntityManager
          .getRepository(Position)
          .create({
            gameId,
            participantId: targetUserId,
            location: point,
            timestamp: new Date(),
            accuracy: 0, // 0 indicates manual override
          });

        const savedPosition = await transactionalEntityManager
          .getRepository(Position)
          .save(position);

        // Log override event with audit trail
        await this.eventsService.logEvent({
          gameId,
          userId: targetUserId,
          type: EventType.POSITION_OVERRIDE,
          severity: 'WARNING' as any,
          message: `Position manually overridden`,
          metadata: {
            executorId,
            executorName:
              executorParticipant.user?.fullName ||
              executorParticipant.user?.email,
            targetUserId,
            targetUserName:
              targetParticipant.user?.fullName || targetParticipant.user?.email,
            location: point,
            timestamp: new Date().toISOString(),
          },
        });

        return savedPosition;
      },
    );
  }
}
