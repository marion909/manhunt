import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
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
import { RulesService } from '../rules/rules.service';

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

export interface UploadHandcuffDto {
  handcuffPhotoUrl: string;
  capturePhotoUrl?: string;
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
    @Inject(forwardRef(() => RulesService))
    private rulesService: RulesService,
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

    // Check if player has active Catch-Free bonus (Rulebook: 3h capture immunity)
    const hasCatchFree = await this.rulesService.hasActiveCatchFree(playerParticipant.id);
    if (hasCatchFree) {
      throw new ForbiddenException('Player has active Catch-Free protection (cannot be captured)');
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
  ): Promise<Capture & { playerInfo: { displayName: string; participantNumber: number | null } }> {
    // Validate game exists and is active
    const game = await this.gamesRepository.findOne({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }

    // Validate hunter is a HUNTER in this game
    // hunterId can be either participantId or userId, check both
    let hunterParticipant = await this.participantsRepository.findOne({
      where: { id: hunterId, gameId, role: Role.HUNTER },
    });
    if (!hunterParticipant) {
      // Fall back to userId lookup
      hunterParticipant = await this.participantsRepository.findOne({
        where: { gameId, userId: hunterId, role: Role.HUNTER },
      });
    }
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

    // Check if player has active Catch-Free bonus (Rulebook: 3h capture immunity)
    const hasCatchFree = await this.rulesService.hasActiveCatchFree(playerParticipant.id);
    if (hasCatchFree) {
      throw new ForbiddenException('Player has active Catch-Free protection (cannot be captured)');
    }

    // Verify capture code - the QR code contains the captureSecret directly
    // We verify it matches the player's stored secret (static code, not TOTP)
    if (!playerParticipant.captureSecret) {
      throw new BadRequestException('Player has no capture code');
    }

    // Direct secret comparison (QR contains the full secret)
    if (dto.code !== playerParticipant.captureSecret) {
      throw new BadRequestException('Invalid capture code');
    }

    // Get hunter position (optional) - use GeoJSON format for geography column
    let captureLocation = { type: 'Point', coordinates: [0, 0] };
    let distanceMeters = 0;

    if (dto.hunterPosition) {
      captureLocation = { 
        type: 'Point', 
        coordinates: [dto.hunterPosition.lng, dto.hunterPosition.lat] 
      };
      
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

    // Create capture record with PENDING_HANDCUFF status (Rulebook: requires handcuff photo)
    const capture = this.capturesRepository.create({
      gameId,
      hunterId: hunterParticipant.userId || null, // Can be null if no user account linked
      playerId: playerParticipant.userId || null, // Can be null if no user account linked
      hunterParticipantId: hunterParticipant.id, // Always set - references game_participants
      playerParticipantId: playerParticipant.id, // Always set - references game_participants
      captureLocation: captureLocation as any,
      distanceMeters,
      status: CaptureStatus.PENDING_HANDCUFF,
      photoUrl: dto.photoUrl,
      handcuffApplied: false,
      initiatedAt: new Date(),
    });

    const savedCapture = await this.capturesRepository.save(capture);

    // Log event (use userId if available, otherwise null - events.user_id is now nullable)
    await this.eventsService.logEvent({
      gameId,
      userId: hunterParticipant.userId || null,
      type: EventType.CAPTURE_ATTEMPT,
      severity: EventSeverity.INFO,
      message: `QR code scanned, awaiting handcuff photo`,
      metadata: {
        captureId: savedCapture.id,
        hunterParticipantId: hunterParticipant.id,
        playerParticipantId: playerParticipant.id,
        playerId: playerParticipant.userId,
        method: 'QR_CODE',
        distance: distanceMeters,
      },
    });

    // Return capture with player info for frontend display
    return {
      ...savedCapture,
      playerInfo: {
        displayName: playerParticipant.displayName,
        participantNumber: playerParticipant.participantNumber,
      },
    };
  }

  /**
   * Complete capture with handcuff photo (Rulebook: two-step capture flow)
   * QR scan -> PENDING_HANDCUFF -> Handcuff photo upload -> CONFIRMED
   */
  async confirmWithHandcuff(
    captureId: string,
    hunterId: string,
    dto: UploadHandcuffDto,
  ): Promise<Capture> {
    const capture = await this.capturesRepository.findOne({
      where: { id: captureId },
      relations: ['game'],
    });

    if (!capture) {
      throw new NotFoundException('Capture not found');
    }

    // Verify it's the same hunter who initiated (check participantId since userId may be null)
    if (capture.hunterParticipantId !== hunterId && capture.hunterId !== hunterId) {
      throw new ForbiddenException('Only the initiating hunter can confirm this capture');
    }

    // Verify capture is in PENDING_HANDCUFF status
    if (capture.status !== CaptureStatus.PENDING_HANDCUFF) {
      throw new BadRequestException(
        `Cannot confirm capture with status ${capture.status}. Expected PENDING_HANDCUFF.`,
      );
    }

    // Lookup hunter participant first to get userId for confirmedBy
    const hunterParticipant = await this.participantsRepository.findOne({
      where: { id: capture.hunterParticipantId },
    });

    // Update capture with handcuff photo
    capture.handcuffApplied = true;
    capture.handcuffPhotoUrl = dto.handcuffPhotoUrl;
    if (dto.capturePhotoUrl) {
      capture.capturePhotoUrl = dto.capturePhotoUrl;
    }
    capture.status = CaptureStatus.CONFIRMED;
    // confirmedBy is a FK to users table, so use userId (null if no user account)
    capture.confirmedBy = hunterParticipant?.userId || null;
    capture.resolvedAt = new Date();

    const updatedCapture = await this.capturesRepository.save(capture);

    // Update player status to CAPTURED (use participantId since userId may be null)
    const playerParticipant = await this.participantsRepository.findOne({
      where: { gameId: capture.gameId, id: capture.playerParticipantId, role: Role.PLAYER },
    });

    if (playerParticipant) {
      playerParticipant.status = ParticipantStatus.CAPTURED;
      await this.participantsRepository.save(playerParticipant);
    }

    await this.eventsService.logEvent({
      gameId: capture.gameId,
      userId: hunterParticipant?.userId || null,
      type: EventType.CAPTURE_CONFIRMED,
      severity: EventSeverity.INFO,
      message: `Capture confirmed with handcuff photo`,
      metadata: {
        captureId: capture.id,
        hunterParticipantId: capture.hunterParticipantId,
        playerParticipantId: capture.playerParticipantId,
        playerId: capture.playerId,
        handcuffPhotoUrl: dto.handcuffPhotoUrl,
      },
    });

    return updatedCapture;
  }

  /**
   * Get captures pending handcuff photo for a hunter
   */
  async getPendingHandcuffCaptures(gameId: string, hunterId: string): Promise<Capture[]> {
    return this.capturesRepository.find({
      where: {
        gameId,
        hunterId,
        status: CaptureStatus.PENDING_HANDCUFF,
      },
      relations: ['player'],
      order: { initiatedAt: 'DESC' },
    });
  }
}
