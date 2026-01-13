import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { GameParticipant } from './entities/game-participant.entity';
import { GameBoundary } from './entities/game-boundary.entity';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { GameStatus, Role } from '../common/enums';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private gamesRepository: Repository<Game>,
    @InjectRepository(GameParticipant)
    private participantsRepository: Repository<GameParticipant>,
    @InjectRepository(GameBoundary)
    private boundariesRepository: Repository<GameBoundary>,
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

    // Add creator as ORGA
    const participant = this.participantsRepository.create({
      gameId: game.id,
      userId: creatorId,
      role: Role.ORGA,
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

  async findActiveGames(): Promise<Game[]> {
    return this.gamesRepository.find({
      where: { status: GameStatus.ACTIVE },
      relations: ['participants'],
    });
  }
}
