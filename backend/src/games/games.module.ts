import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { Game } from './entities/game.entity';
import { GameParticipant } from './entities/game-participant.entity';
import { GameBoundary } from './entities/game-boundary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Game, GameParticipant, GameBoundary])],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
