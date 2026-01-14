import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { GameParticipant } from './entities/game-participant.entity';
import { GameBoundary } from './entities/game-boundary.entity';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { GameStatus, Role } from '../common/enums';
import { CaptureCodeService } from '../captures/capture-code.service';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private gamesRepository: Repository<Game>,
    @InjectRepository(GameParticipant)
    private participantsRepository: Repository<GameParticipant>,
    @InjectRepository(GameBoundary)
    private boundariesRepository: Repository<GameBoundary>,
    private captureCodeService: CaptureCodeService,
  ) {}

  async create(createGameDto: CreateGameDto, creatorId: string): Promise<Game> {
    const { boundaries, ...gameData } = createGameDto;

    // Create game
    const game = this.gamesRepository.create({
      ...gameData,
      creatorId,
      status: GameStatus.DRAFT,
    });
    await this.gamesRepository.save(game);

    // Get next participant number
    const maxParticipantNumber = await this.participantsRepository
      .createQueryBuilder('participant')
      .select('MAX(participant.participantNumber)', 'max')
      .getRawOne();
    const nextNumber = (maxParticipantNumber?.max || 0) + 1;

    // Add creator as ORGA
    const participant = this.participantsRepository.create({
      gameId: game.id,
      userId: creatorId,
      role: Role.ORGA,
      participantNumber: nextNumber,
    });
    await this.participantsRepository.save(participant);

    // Create boundaries
    if (boundaries && boundaries.length > 0) {
      const boundaryEntities = boundaries.map((boundary) =>
        this.boundariesRepository.create({
          ...boundary,
          gameId: game.id,
        }),
      );
      await this.boundariesRepository.save(boundaryEntities);
    }

    return this.findOne(game.id, creatorId);
  }

  async findAll(userId: string): Promise<Game[]> {
    // Get all games where user is participant
    const participants = await this.participantsRepository.find({
      where: { userId },
      relations: ['game'],
    });

    return participants.map((p) => p.game);
  }

  async findOne(id: string, userId: string): Promise<Game> {
    const game = await this.gamesRepository.findOne({
      where: { id },
      relations: ['participants', 'participants.user', 'boundaries'],
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    // Check if user is participant
    const isParticipant = game.participants.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    return game;
  }

  async update(id: string, updateGameDto: UpdateGameDto, userId: string): Promise<Game> {
    const game = await this.findOne(id, userId);

    // Check if user is ORGA
    const participant = game.participants.find((p) => p.userId === userId);
    if (participant?.role !== Role.ORGA) {
      throw new ForbiddenException('Only ORGA can update game');
    }

    Object.assign(game, updateGameDto);
    await this.gamesRepository.save(game);

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const game = await this.findOne(id, userId);

    // Check if user is creator
    if (game.creatorId !== userId) {
      throw new ForbiddenException('Only creator can delete game');
    }

    await this.gamesRepository.remove(game);
  }

  async addParticipant(gameId: string, userId: string, role: Role): Promise<GameParticipant> {
    const participant = this.participantsRepository.create({
      gameId,
      userId,
      role,
    });
    return this.participantsRepository.save(participant);
  }

  async getUserRole(gameId: string, userId: string): Promise<Role | null> {
    const participant = await this.participantsRepository.findOne({
      where: { gameId, userId },
    });
    return participant?.role || null;
  }

  async getParticipantRole(gameId: string, participantId: string): Promise<Role | null> {
    console.log('getParticipantRole called with:', { gameId, participantId });
    const participant = await this.participantsRepository.findOne({
      where: { gameId, id: participantId },
    });
    console.log('Found participant:', participant);
    return participant?.role || null;
  }

  async getParticipantById(participantId: string): Promise<GameParticipant | null> {
    return this.participantsRepository.findOne({
      where: { id: participantId },
      relations: ['game'],
    });
  }

  async findParticipantByUserId(gameId: string, userId: string): Promise<GameParticipant | null> {
    return this.participantsRepository.findOne({
      where: { gameId, userId },
      relations: ['user'],
    });
  }

  async getGameParticipants(gameId: string): Promise<GameParticipant[]> {
    return this.participantsRepository.find({
      where: { gameId },
      relations: ['user'],
      order: { role: 'ASC', joinedAt: 'ASC' },
    });
  }

  async findActiveGames(): Promise<Game[]> {
    return this.gamesRepository.find({
      where: { status: GameStatus.ACTIVE },
      relations: ['participants'],
    });
  }

  async startGame(id: string, userId: string): Promise<Game> {
    const game = await this.findOne(id, userId);

    // Check if user is ORGA
    const participant = game.participants.find((p) => p.userId === userId);
    if (participant?.role !== Role.ORGA) {
      throw new ForbiddenException('Only ORGA can start game');
    }

    if (game.status !== GameStatus.DRAFT && game.status !== GameStatus.PENDING) {
      throw new ForbiddenException('Game must be in DRAFT or PENDING status to start');
    }

    game.status = GameStatus.ACTIVE;
    game.startTime = new Date();
    await this.gamesRepository.save(game);

    // Generate TOTP secrets for all PLAYER participants
    const players = await this.participantsRepository.find({
      where: { gameId: id, role: Role.PLAYER },
    });

    for (const player of players) {
      if (!player.captureSecret) {
        player.captureSecret = this.captureCodeService.generateSecret();
        await this.participantsRepository.save(player);
      }
    }

    return this.findOne(id, userId);
  }

  async pauseGame(id: string, userId: string): Promise<Game> {
    const game = await this.findOne(id, userId);

    const participant = game.participants.find((p) => p.userId === userId);
    if (participant?.role !== Role.ORGA && participant?.role !== Role.OPERATOR) {
      throw new ForbiddenException('Only ORGA or OPERATOR can pause game');
    }

    if (game.status !== GameStatus.ACTIVE) {
      throw new ForbiddenException('Can only pause ACTIVE games');
    }

    game.status = GameStatus.PAUSED;
    await this.gamesRepository.save(game);

    return this.findOne(id, userId);
  }

  async resumeGame(id: string, userId: string): Promise<Game> {
    const game = await this.findOne(id, userId);

    const participant = game.participants.find((p) => p.userId === userId);
    if (participant?.role !== Role.ORGA && participant?.role !== Role.OPERATOR) {
      throw new ForbiddenException('Only ORGA or OPERATOR can resume game');
    }

    if (game.status !== GameStatus.PAUSED) {
      throw new ForbiddenException('Can only resume PAUSED games');
    }

    game.status = GameStatus.ACTIVE;
    await this.gamesRepository.save(game);

    return this.findOne(id, userId);
  }

  async finishGame(id: string, userId: string): Promise<Game> {
    const game = await this.findOne(id, userId);

    const participant = game.participants.find((p) => p.userId === userId);
    if (participant?.role !== Role.ORGA) {
      throw new ForbiddenException('Only ORGA can finish game');
    }

    if (game.status !== GameStatus.ACTIVE && game.status !== GameStatus.PAUSED) {
      throw new ForbiddenException('Can only finish ACTIVE or PAUSED games');
    }

    game.status = GameStatus.FINISHED;
    game.endTime = new Date();
    await this.gamesRepository.save(game);

    return this.findOne(id, userId);
  }
}
