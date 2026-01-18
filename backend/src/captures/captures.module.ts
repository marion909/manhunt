import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapturesService } from './captures.service';
import { CapturesController, CapturesStandaloneController } from './captures.controller';
import { Capture } from './entities/capture.entity';
import { Game } from '../games/entities/game.entity';
import { GameParticipant } from '../games/entities/game-participant.entity';
import { Position } from '../tracking/entities/position.entity';
import { EventsModule } from '../events/events.module';
import { CaptureCodeService } from './capture-code.service';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Capture, Game, GameParticipant, Position]),
    EventsModule,
    forwardRef(() => RulesModule),
  ],
  controllers: [CapturesController, CapturesStandaloneController],
  providers: [CapturesService, CaptureCodeService],
  exports: [CapturesService],
})
export class CapturesModule {}
