import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation } from './entities/invitation.entity';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { GamesService } from '../games/games.service';
import { Role } from '../common/enums';
import { randomBytes } from 'crypto';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private invitationsRepository: Repository<Invitation>,
    private gamesService: GamesService,
  ) {}

  async create(
    gameId: string,
    createInvitationDto: CreateInvitationDto,
    creatorId: string,
  ): Promise<Invitation> {
    // Check if user is ORGA
    const userRole = await this.gamesService.getUserRole(gameId, creatorId);
    if (userRole !== Role.ORGA) {
      throw new ForbiddenException('Only ORGA can create invitations');
    }

    // Generate unique token
    const token = randomBytes(16).toString('hex');

    const invitation = this.invitationsRepository.create({
      gameId,
      token,
      role: createInvitationDto.role,
      maxUses: createInvitationDto.maxUses || 1,
      expiresAt: createInvitationDto.expiresAt ? new Date(createInvitationDto.expiresAt) : null,
      createdBy: creatorId,
    });

    return this.invitationsRepository.save(invitation);
  }

  async findAllByGame(gameId: string, userId: string): Promise<Invitation[]> {
    // Check if user is ORGA
    const userRole = await this.gamesService.getUserRole(gameId, userId);
    if (userRole !== Role.ORGA) {
      throw new ForbiddenException('Only ORGA can view invitations');
    }

    return this.invitationsRepository.find({
      where: { gameId },
      order: { createdAt: 'DESC' },
    });
  }

  async accept(token: string, userId: string): Promise<{ gameId: string; role: Role }> {
    const invitation = await this.invitationsRepository.findOne({
      where: { token },
      relations: ['game'],
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation token');
    }

    // Check expiration
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    // Check usage limit
    if (invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestException('Invitation has reached max uses');
    }

    // Add user as participant
    await this.gamesService.addParticipant(invitation.gameId, userId, invitation.role);

    // Increment usage count
    invitation.usedCount += 1;
    await this.invitationsRepository.save(invitation);

    return {
      gameId: invitation.gameId,
      role: invitation.role,
    };
  }

  async revoke(id: string, userId: string): Promise<void> {
    const invitation = await this.invitationsRepository.findOne({
      where: { id },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Check if user is ORGA
    const userRole = await this.gamesService.getUserRole(invitation.gameId, userId);
    if (userRole !== Role.ORGA) {
      throw new ForbiddenException('Only ORGA can revoke invitations');
    }

    await this.invitationsRepository.remove(invitation);
  }
}
