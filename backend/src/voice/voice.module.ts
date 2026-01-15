import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VoiceGateway } from './voice.gateway';
import { VoiceService } from './voice.service';
import { GamesModule } from '../games/games.module';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    GamesModule,
    RulesModule,
  ],
  providers: [VoiceGateway, VoiceService],
  exports: [VoiceService, VoiceGateway],
})
export class VoiceModule {}
