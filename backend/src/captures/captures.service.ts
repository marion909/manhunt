import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Capture, CaptureStatus } from './entities/capture.entity';
import { Game } from '../games/entities/game.entity';
import { GameParticipant } from '../games/entities/game-participant.entity';
import { Position } from '../tracking/entities/position.entity';
import { EventsService } from '../events/events.service';
import { EventType, EventSeverity, Role, ParticipantStatus } from '../common/enums';
import { CaptureCodeService } from './capture-code.service';

export interface InitiateCaptureDto {
  playerId: string;
  photoUrl?: string;
}

export interface ScanCaptureDto {
  participantId: string;
  code: string;
  hunterPosition?: { lat: number; lng: number };
  photoUrl?: string;
}

export interface ResolveCaptureDto {
  status: CaptureStatus.CONFIRMED | CaptureStatus.REJECTED;
}

@Injectable()
export class CapturesService {
  constructor(
    @InjectRepository(Capture)
    private capturesRepository: Repository<Capture>,
    @InjectRepository(Game)
    private gamesRepository: Repository<Game>,
    @InjectRepository(GameParticipant)
    private participantsRepository: Repository<GameParticipant>,
    @InjectRepository(Position)
    private positionsRepository: Repository<Position>,
    private eventsService: EventsService,
    private captureCodeService: CaptureCodeService,
  ) {}

  /**
   * Hunter initiates a capture attempt
   */
  async initiateCapture(
    gameId: string,
    hunterId: string,
    dto: InitiateCaptureDto,
  ): Promise<Capture> {
    // Validate game exists and is active
    const game = await this.gamesRepository.findOne({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }

    // Validate hunter is a HUNTER in this game
    const hunterParticipant = await this.participantsRepository.findOne({
      where: { gameId, userId: hunterId, role: Role.HUNTER },
    });
    if (!hunterParticipant) {
      throw new ForbiddenException('Only hunters can initiate captures');
    }

    // Validate player is a PLAYER in this game
    const playerParticipant = await this.participantsRepository.findOne({
      where: { gameId, userId: dto.playerId, role: Role.PLAYER },
    });
    if (!playerParticipant) {
      throw new NotFoundException('Player not found in this game');
    }

    // Get latest positions for both hunter and player
    const hunterPosition = await this.positionsRepository.findOne({
      where: { gameId, participantId: hunterId },
      order: { timestamp: 'DESC' },
    });

    const playerPosition = await this.positionsRepository.findOne({
      where: { gameId, participantId: dto.playerId },
      order: { timestamp: 'DESC' },
    });

    if (!hunterPosition || !playerPosition) {
      throw new BadRequestException('Position data not available for both users');
    }

    // Calculate distance using PostGIS ST_Distance
    const result = await this.capturesRepository.manager.query(
      `SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) as distance`,
      [
        hunterPosition.location.coordinates[0],
        hunterPosition.location.coordinates[1],
        playerPosition.location.coordinates[0],
        playerPosition.location.coordinates[1],
      ],
    );

    const distanceMeters = result[0]?.distance || 0;

    // Check if within capture radius
    if (distanceMeters > game.captureRadiusMeters) {
      throw new BadRequestException(
        `Player is too far away (${Math.round(distanceMeters)}m > ${game.captureRadiusMeters}m)`,
      );
    }

    // Create capture record
    const capture = this.capturesRepository.create({
      gameId,
      hunterId,
      playerId: dto.playerId,
      captureLocation: `POINT(${hunterPosition.location.coordinates[0]} ${hunterPosition.location.coordinates[1]})`,
      distanceMeters,
      status: CaptureStatus.PENDING,
      photoUrl: dto.photoUrl,
      initiatedAt: new Date(),
    });

    const savedCapture = await this.capturesRepository.save(capture);

    // Log event
    await this.eventsService.logEvent({
      gameId,
      userId: hunterId,
      type: EventType.CAPTURE_ATTEMPT,
      severity: EventSeverity.INFO,
      message: `Hunter attempted to capture player`,
      metadata: {
        captureId: savedCapture.id,
        playerId: dto.playerId,
        distance: distanceMeters,
      },
    });

    return savedCapture;
  }

  /**
   * Orga confirms or rejects a capture
   */
  async resolveCapture(
    captureId: string,
    organizerId: string,
    dto: ResolveCaptureDto,
  ): Promise<Capture> {
    const capture = await this.capturesRepository.findOne({
      where: { id: captureId },
      relations: ['game'],
    });

    if (!capture) {
      throw new NotFoundException('Capture not found');
    }

    // Validate organizer has permission (ORGA or OPERATOR)
    const organizer = await this.participantsRepository.findOne({
      where: { gameId: capture.gameId, userId: organizerId },
    });

    if (!organizer || (organizer.role !== Role.ORGA && organizer.role !== Role.OPERATOR)) {
      throw new ForbiddenException('Only organizers can resolve captures');
    }

    if (capture.status !== CaptureStatus.PENDING) {
      throw new BadRequestException('Capture already resolved');
    }

    // Update capture status
    capture.status = dto.status;
    capture.confirmedBy = organizerId;
    capture.resolvedAt = new Date();

    const updatedCapture = await this.capturesRepository.save(capture);

    // Log event
    const eventType =
      dto.status === CaptureStatus.CONFIRMED ? EventType.CAPTURE_CONFIRMED : EventType.CAPTURE_ATTEMPT;

    await this.eventsService.logEvent({
      gameId: capture.gameId,
      userId: capture.hunterId,
      type: eventType,
      severity: EventSeverity.INFO,
      message:
        dto.status === CaptureStatus.CONFIRMED
          ? `Capture confirmed by organizer`
          : `Capture rejected by organizer`,
      metadata: {
        captureId: capture.id,
        playerId: capture.playerId,
        organizerId,
      },
    });

    return updatedCapture;
  }

  /**
   * Get all captures for a game
   */
  async getCaptures(gameId: string): Promise<Capture[]> {
    return this.capturesRepository.find({
      where: { gameId },
      relations: ['hunter', 'player', 'confirmer'],
      order: { initiatedAt: 'DESC' },
    });
  }

  /**
   * Get pending captures for a game
   */
  async getPendingCaptures(gameId: string): Promise<Capture[]> {
    return this.capturesRepository.find({
      where: { gameId, status: CaptureStatus.PENDING },
      relations: ['hunter', 'player'],
      order: { initiatedAt: 'DESC' },
    });
  }

  /**
   * Get capture by ID
   */
  async getCapture(id: string): Promise<Capture> {
    const capture = await this.capturesRepository.findOne({
      where: { id },
      relations: ['hunter', 'player', 'confirmer'],
    });

    if (!capture) {
      throw new NotFoundException('Capture not found');
    }

    return capture;
  }

  /**
   * Capture via QR code scan - automatic confirmation
   */
  async captureByQRCode(
    gameId: string,
    hunterId: string,
    dto: ScanCaptureDto,
  ): Promise<Capture> {
    // Validate game exists and is active
    const game = await this.gamesRepository.findOne({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }

    // Validate hunter is a HUNTER in this game
    const hunterParticipant = await this.participantsRepository.findOne({
      where: { gameId, userId: hunterId, role: Role.HUNTER },
    });
    if (!hunterParticipant) {
      throw new ForbiddenException('Only hunters can capture');
    }

    // Find player participant by participantId
    const playerParticipant = await this.participantsRepository.findOne({
      where: { id: dto.participantId, gameId, role: Role.PLAYER },
      relations: ['user'],
    });
    if (!playerParticipant) {
      throw new NotFoundException('Player not found in this game');
    }

    // Prevent self-capture
    if (hunterId === playerParticipant.userId) {
      throw new BadRequestException('You cannot capture yourself');
    }

    // Check if player is already captured
    if (playerParticipant.status === ParticipantStatus.CAPTURED) {
      throw new BadRequestException('Player is already captured');
    }

    // Verify TOTP code
    if (!playerParticipant.captureSecret) {
      throw new BadRequestException('Player has no capture code');
    }

    const isValidCode = this.captureCodeService.verifyCode(
      dto.code,
      playerParticipant.captureSecret,
    );

    if (!isValidCode) {
      throw new BadRequestException('Invalid or expired capture code');
    }

    // Get hunter position (optional)
    let captureLocation = 'POINT(0 0)';
    let distanceMeters = 0;

    if (dto.hunterPosition) {
      captureLocation = `POINT(${dto.hunterPosition.lng} ${dto.hunterPosition.lat})`;
      
      // Calculate distance if player position is available
      const playerPosition = await this.positionsRepository.findOne({
        where: { gameId, participantId: playerParticipant.id },
        order: { timestamp: 'DESC' },
      });

      if (playerPosition) {
        const result = await this.capturesRepository.manager.query(
          `SELECT ST_Distance(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
          ) as distance`,
          [
            dto.hunterPosition.lng,
            dto.hunterPosition.lat,
            playerPosition.location.coordinates[0],
            playerPosition.location.coordinates[1],
          ],
        );
        distanceMeters = result[0]?.distance || 0;
      }
    }

    // Create capture record with CONFIRMED status (auto-confirmed via QR)
    const capture = this.capturesRepository.create({
      gameId,
      hunterId,
      playerId: playerParticipant.userId,
      captureLocation,
      distanceMeters,
      status: CaptureStatus.CONFIRMED,
      photoUrl: dto.photoUrl,
      confirmedBy: hunterId, // Hunter is also the confirmer for QR captures
      initiatedAt: new Date(),
      resolvedAt: new Date(),
    });

    const savedCapture = await this.capturesRepository.save(capture);

    // Update player status to CAPTURED
    playerParticipant.status = ParticipantStatus.CAPTURED;
    await this.participantsRepository.save(playerParticipant);

    // Log event
    await this.eventsService.logEvent({
      gameId,
      userId: hunterId,
      type: EventType.CAPTURE_CONFIRMED,
      severity: EventSeverity.INFO,
      message: `Player captured via QR code`,
      metadata: {
        captureId: savedCapture.id,
        playerId: playerParticipant.userId,
        method: 'QR_CODE',
        distance: distanceMeters,
      },
    });

    return savedCapture;
  }
}
