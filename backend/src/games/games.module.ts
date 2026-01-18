import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { GameParticipantsService } from './game-participants.service';
import { GameParticipantsController } from './game-participants.controller';
import { Game } from './entities/game.entity';
import { GameParticipant } from './entities/game-participant.entity';
import { GameBoundary } from './entities/game-boundary.entity';
import { HunterAccess } from './entities/hunter-access.entity';
import { CaptureCodeService } from '../captures/capture-code.service';
import { EventsModule } from '../events/events.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, GameParticipant, GameBoundary, HunterAccess]),
    EventsModule,
    forwardRef(() => TrackingModule),
  ],
  controllers: [GamesController, GameParticipantsController],
  providers: [GamesService, GameParticipantsService, CaptureCodeService],
  exports: [GamesService, GameParticipantsService],
})
export class GamesModule {}
