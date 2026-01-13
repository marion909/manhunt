import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { PingProcessor } from './processors/ping.processor';
import { PingSchedulerService } from './services/ping-scheduler.service';
import { Position } from './entities/position.entity';
import { Ping } from './entities/ping.entity';
import { GamesModule } from '../games/games.module';
import { GeospatialModule } from '../geospatial/geospatial.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, Ping]),
    BullModule.registerQueue({
      name: 'ping-generation',
    }),
    GamesModule,
    GeospatialModule,
  ],
  controllers: [TrackingController],
  providers: [TrackingGateway, TrackingService, PingProcessor, PingSchedulerService],
  exports: [TrackingService, PingSchedulerService],
})
export class TrackingModule {}
