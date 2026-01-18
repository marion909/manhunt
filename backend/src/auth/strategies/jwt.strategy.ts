import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Check if this is a participant token (from mobile app loginParticipant)
    if (payload.participantId) {
      // Return participant info directly - no user lookup needed
      return {
        id: payload.participantId, // Use participantId as the primary identifier
        participantId: payload.participantId,
        userId: payload.userId !== payload.participantId ? payload.userId : null,
        role: payload.role,
        gameId: payload.gameId,
      };
    }

    // Standard user token - lookup user
    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { id: user.id, userId: user.id, email: user.email };
  }
}
