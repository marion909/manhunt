import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { GameRule } from './entities/game-rule.entity';
import { Game } from '../games/entities/game.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([GameRule, Game]), EventsModule],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
