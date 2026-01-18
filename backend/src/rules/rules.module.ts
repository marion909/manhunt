import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { GameRule } from './entities/game-rule.entity';
import { ParticipantRuleState } from './entities/participant-rule-state.entity';
import { SpeedhuntSession } from './entities/speedhunt-session.entity';
import { Game } from '../games/entities/game.entity';
import { EventsModule } from '../events/events.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameRule, ParticipantRuleState, SpeedhuntSession, Game]),
    EventsModule,
    forwardRef(() => TrackingModule),
  ],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
