import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(GameParticipant)
    private gameParticipantsRepository: Repository<GameParticipant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const gameId = request.params.gameId || request.body.gameId;

    if (!gameId) {
      return false;
    }

    // Get user's role in this game
    const participant = await this.gameParticipantsRepository.findOne({
      where: {
        gameId,
        userId: user.userId,
      },
    });

    if (!participant) {
      return false;
    }

    return requiredRoles.includes(participant.role);
  }
}
