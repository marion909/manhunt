import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameParticipant } from './entities/game-participant.entity';
import { ParticipantStatus, Role } from '../common/enums';
import { EventsService } from '../events/events.service';

export interface GameStatistics {
  totalPlayers: number;
  activePlayers: number;
  capturedPlayers: number;
  disqualifiedPlayers: number;
  totalHunters: number;
  activeHunters: number;
}

@Injectable()
export class GameParticipantsService {
  constructor(
    @InjectRepository(GameParticipant)
    private participantsRepository: Repository<GameParticipant>,
    private readonly eventsService: EventsService,
  ) {}

  async updateParticipantStatus(
    userId: string,
    gameId: string,
    status: ParticipantStatus,
  ): Promise<GameParticipant> {
    const participant = await this.participantsRepository.findOne({
      where: { userId, gameId },
      relations: ['user', 'game'],
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    // Only allow status updates for PLAYER and HUNTER roles
    if (participant.role !== Role.PLAYER && participant.role !== Role.HUNTER) {
      throw new ForbiddenException('Cannot change status for ORGA or OPERATOR');
    }

    participant.status = status;
    return this.participantsRepository.save(participant);
  }

  async disqualifyParticipant(
    userId: string,
    gameId: string,
    executorId: string,
  ): Promise<GameParticipant> {
    // Check if executor has permission (ORGA or OPERATOR)
    const executor = await this.participantsRepository.findOne({
      where: { userId: executorId, gameId },
    });

    if (!executor || (executor.role !== Role.ORGA && executor.role !== Role.OPERATOR)) {
      throw new ForbiddenException('Only ORGA or OPERATOR can disqualify participants');
    }

    return this.updateParticipantStatus(userId, gameId, ParticipantStatus.DISQUALIFIED);
  }

  async getGameStatistics(gameId: string): Promise<GameStatistics> {
    const participants = await this.participantsRepository.find({
      where: { gameId },
    });

    const players = participants.filter((p) => p.role === Role.PLAYER);
    const hunters = participants.filter((p) => p.role === Role.HUNTER);

    return {
      totalPlayers: players.length,
      activePlayers: players.filter((p) => p.status === ParticipantStatus.ACTIVE).length,
      capturedPlayers: players.filter((p) => p.status === ParticipantStatus.CAPTURED).length,
      disqualifiedPlayers: players.filter((p) => p.status === ParticipantStatus.DISQUALIFIED).length,
      totalHunters: hunters.length,
      activeHunters: hunters.filter((p) => p.status === ParticipantStatus.ACTIVE).length,
    };
  }

  async getGameParticipants(gameId: string): Promise<GameParticipant[]> {
    return this.participantsRepository.find({
      where: { gameId },
      relations: ['user'],
      order: { role: 'ASC', joinedAt: 'ASC' },
    });
  }

  async getParticipantRole(userId: string, gameId: string): Promise<Role | null> {
    const participant = await this.participantsRepository.findOne({
      where: { userId, gameId },
    });
    return participant?.role || null;
  }

  async findParticipant(gameId: string, userId: string): Promise<GameParticipant | null> {
    return this.participantsRepository.findOne({
      where: { gameId, userId },
      relations: ['user', 'game'],
    });
  }

  async findParticipantById(participantId: string): Promise<GameParticipant | null> {
    return this.participantsRepository.findOne({
      where: { id: participantId },
      relations: ['user', 'game'],
    });
  }

  async overrideStatus(
    userId: string,
    gameId: string,
    status: ParticipantStatus,
    executorId: string,
  ): Promise<GameParticipant> {
    // Start transaction with pessimistic write lock
    return await this.participantsRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Lock participant record
        const participant = await transactionalEntityManager
          .getRepository(GameParticipant)
          .createQueryBuilder('participant')
          .setLock('pessimistic_write')
          .leftJoinAndSelect('participant.user', 'user')
          .where('participant.userId = :userId', { userId })
          .andWhere('participant.gameId = :gameId', { gameId })
          .getOne();

        if (!participant) {
          throw new NotFoundException('Participant not found');
        }

        // Check executor permission
        const executor = await transactionalEntityManager
          .getRepository(GameParticipant)
          .findOne({
            where: { userId: executorId, gameId },
            relations: ['user'],
          });

        if (
          !executor ||
          (executor.role !== Role.ORGA && executor.role !== Role.OPERATOR)
        ) {
          throw new ForbiddenException(
            'Only ORGA/OPERATOR can override status',
          );
        }

        // Prevent status change for ORGA/OPERATOR roles
        if (
          participant.role !== Role.PLAYER &&
          participant.role !== Role.HUNTER
        ) {
          throw new ForbiddenException(
            'Cannot change status for ORGA or OPERATOR',
          );
        }

        const oldStatus = participant.status;
        participant.status = status;

        const savedParticipant = await transactionalEntityManager
          .getRepository(GameParticipant)
          .save(participant);

        // Log override event
        const EventType = (await import('../common/enums/event-type.enum'))
          .EventType;

        await this.eventsService.logEvent({
          gameId,
          userId,
          type: EventType.STATUS_OVERRIDE,
          severity: 'WARNING' as any,
          message: `Status manually overridden from ${oldStatus} to ${status}`,
          metadata: {
            executorId,
            executorName: executor.user?.fullName || executor.user?.email,
            targetUserId: userId,
            targetUserName:
              participant.user?.fullName || participant.user?.email,
            oldStatus,
            newStatus: status,
            timestamp: new Date().toISOString(),
          },
        });

        return savedParticipant;
      },
    );
  }

  async removeParticipant(
    userId: string,
    gameId: string,
    executorId: string,
  ): Promise<void> {
    // Start transaction
    await this.participantsRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Check executor is ORGA
        const executor = await transactionalEntityManager
          .getRepository(GameParticipant)
          .findOne({
            where: { userId: executorId, gameId },
            relations: ['user'],
          });

        if (!executor || executor.role !== Role.ORGA) {
          throw new ForbiddenException('Only ORGA can remove participants');
        }

        // Lock and get participant
        const participant = await transactionalEntityManager
          .getRepository(GameParticipant)
          .createQueryBuilder('participant')
          .setLock('pessimistic_write')
          .leftJoinAndSelect('participant.user', 'user')
          .where('participant.userId = :userId', { userId })
          .andWhere('participant.gameId = :gameId', { gameId })
          .getOne();

        if (!participant) {
          throw new NotFoundException('Participant not found');
        }

        // Remove participant
        await transactionalEntityManager
          .getRepository(GameParticipant)
          .remove(participant);

        // Log removal event
        const EventType = (await import('../common/enums/event-type.enum'))
          .EventType;

        await this.eventsService.logEvent({
          gameId,
          userId,
          type: EventType.MANUAL_INTERVENTION,
          severity: 'CRITICAL' as any,
          message: `Participant removed from game`,
          metadata: {
            executorId,
            executorName: executor.user?.fullName || executor.user?.email,
            removedUserId: userId,
            removedUserName:
              participant.user?.fullName || participant.user?.email,
            removedRole: participant.role,
            timestamp: new Date().toISOString(),
          },
        });
      },
    );
  }

  async addManualParticipant(
    gameId: string,
    displayName: string,
    role: Role,
    executorId: string,
  ): Promise<GameParticipant> {
    // Check executor is ORGA or OPERATOR
    const executor = await this.participantsRepository.findOne({
      where: { userId: executorId, gameId },
    });

    if (!executor || (executor.role !== Role.ORGA && executor.role !== Role.OPERATOR)) {
      throw new ForbiddenException('Only ORGA or OPERATOR can add manual participants');
    }

    // Only allow HUNTER or PLAYER roles for manual participants
    if (role !== Role.HUNTER && role !== Role.PLAYER) {
      throw new ForbiddenException('Manual participants can only be HUNTER or PLAYER');
    }

    // Get next global participant number
    const lastParticipant = await this.participantsRepository
      .createQueryBuilder('participant')
      .orderBy('participant.participant_number', 'DESC')
      .getOne();

    const nextNumber = lastParticipant ? lastParticipant.participantNumber + 1 : 1;

    // Create manual participant
    const participant = this.participantsRepository.create({
      gameId,
      userId: null,
      displayName,
      role,
      participantNumber: nextNumber,
      status: ParticipantStatus.ACTIVE,
    });

    return this.participantsRepository.save(participant);
  }
}
