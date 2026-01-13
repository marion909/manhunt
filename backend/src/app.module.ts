import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { InvitationsModule } from './invitations/invitations.module';
import { GeospatialModule } from './geospatial/geospatial.module';
import { TrackingModule } from './tracking/tracking.module';
import { EventsModule } from './events/events.module';
import { User } from './users/entities/user.entity';
import { Game } from './games/entities/game.entity';
import { GameParticipant } from './games/entities/game-participant.entity';
import { GameBoundary } from './games/entities/game-boundary.entity';
import { Position } from './tracking/entities/position.entity';
import { Ping } from './tracking/entities/ping.entity';
import { Event } from './events/entities/event.entity';
import { Invitation } from './invitations/entities/invitation.entity';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        entities: [
          User,
          Game,
          GameParticipant,
          GameBoundary,
          Position,
          Ping,
          Event,
          Invitation,
        ],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Bull Queue (Redis)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Scheduling
    ScheduleModule.forRoot(),

    // Feature modules
    GeospatialModule,
    AuthModule,
    UsersModule,
    GamesModule,
    InvitationsModule,
    TrackingModule,
    EventsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
