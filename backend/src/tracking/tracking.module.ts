import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { PingProcessor } from './processors/ping.processor';
import { PingSchedulerService } from './services/ping-scheduler.service';
import { SilenthuntSchedulerService } from './services/silenthunt-scheduler.service';
import { BoundaryTimerService } from './services/boundary-timer.service';
import { StationaryDetectionService } from './services/stationary-detection.service';
import { ProximityDetectionService } from './services/proximity-detection.service';
import { Position } from './entities/position.entity';
import { Ping } from './entities/ping.entity';
import { GameParticipant } from '../games/entities/game-participant.entity';
import { GamesModule } from '../games/games.module';
import { GeospatialModule } from '../geospatial/geospatial.module';
import { EventsModule } from '../events/events.module';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, Ping, GameParticipant]),
    BullModule.registerQueue({
      name: 'ping-generation',
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    forwardRef(() => GamesModule),
    GeospatialModule,
    EventsModule,
    forwardRef(() => RulesModule),
  ],
  controllers: [TrackingController],
  providers: [
    TrackingGateway,
    TrackingService,
    PingProcessor,
    PingSchedulerService,
    SilenthuntSchedulerService,
    BoundaryTimerService,
    StationaryDetectionService,
    ProximityDetectionService,
  ],
  exports: [
    TrackingService,
    PingSchedulerService,
    TrackingGateway,
    BoundaryTimerService,
    StationaryDetectionService,
    ProximityDetectionService,
  ],
})
export class TrackingModule {}
