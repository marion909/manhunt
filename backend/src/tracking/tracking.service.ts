import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Position } from './entities/position.entity';
import { Ping } from './entities/ping.entity';
import { PositionUpdateDto } from './dto/position-update.dto';
import { GeospatialService } from '../geospatial/geospatial.service';
import { GamesService } from '../games/games.service';
import { Role } from '../common/enums';
import { Point } from 'geojson';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(Position)
    private positionsRepository: Repository<Position>,
    @InjectRepository(Ping)
    private pingsRepository: Repository<Ping>,
    private geospatialService: GeospatialService,
    private gamesService: GamesService,
  ) {}

  async savePosition(
    gameId: string,
    userId: string,
    positionDto: PositionUpdateDto,
  ): Promise<Position> {
    const point: Point = {
      type: 'Point',
      coordinates: [positionDto.longitude, positionDto.latitude],
    };

    const position = this.positionsRepository.create({
      gameId,
      userId,
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

  async getLatestPosition(gameId: string, userId: string): Promise<Position | null> {
    return this.positionsRepository.findOne({
      where: { gameId, userId },
      order: { timestamp: 'DESC' },
    });
  }

  async getHunterPositions(gameId: string): Promise<Position[]> {
    // Get all hunters in game
    const game = await this.gamesService.findOne(gameId, gameId); // Temp workaround
    const hunters = game.participants.filter((p) => p.role === Role.HUNTER);

    // Get latest position for each hunter
    const positions = await Promise.all(
      hunters.map((hunter) => this.getLatestPosition(gameId, hunter.userId)),
    );

    return positions.filter((p) => p !== null);
  }

  async getPlayerPings(gameId: string): Promise<Ping[]> {
    // Get pings from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.pingsRepository.find({
      where: {
        gameId,
        revealedAt: LessThan(new Date()),
        timestamp: LessThan(oneDayAgo),
      },
      order: { timestamp: 'DESC' },
    });
  }

  async generatePing(gameId: string, playerId: string): Promise<Ping> {
    // Get player's current position
    const position = await this.getLatestPosition(gameId, playerId);
    if (!position) {
      throw new Error('No position available for player');
    }

    const actualPoint: Point = position.location;

    // Generate fake offset (within 200m radius)
    const revealedPoint = this.geospatialService.generateRandomPointInRadius(actualPoint, 200);

    // Delayed reveal (5-30 seconds)
    const delaySeconds = Math.floor(Math.random() * 25) + 5;
    const revealTime = new Date(Date.now() + delaySeconds * 1000);

    const ping = this.pingsRepository.create({
      gameId,
      playerId,
      actualLocation: actualPoint,
      revealedLocation: revealedPoint,
      radiusMeters: 200,
      timestamp: new Date(),
      revealedAt: revealTime,
    });

    return this.pingsRepository.save(ping);
  }

  async checkBoundaryViolation(gameId: string, userId: string): Promise<boolean> {
    const position = await this.getLatestPosition(gameId, userId);
    if (!position) return false;

    return !(await this.geospatialService.isPointInGameArea(position.location, gameId));
  }

  async getPositionHistory(
    gameId: string,
    userId: string,
    limit: number = 100,
  ): Promise<Position[]> {
    return this.positionsRepository.find({
      where: { gameId, userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }
}
