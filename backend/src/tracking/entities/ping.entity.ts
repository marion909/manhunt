import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Game } from '../../games/entities/game.entity';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import type { Point } from 'geojson';

/**
 * Ping Sources:
 * - PERIODIC: Automatischer 10-Sekunden-Ping von allen Teilnehmern
 * - SPEEDHUNT: Ping durch aktive Speedhunt-Session
 * - SILENTHUNT: Ping durch Silenthunt-Regel (Zonen-basiert, stündlich)
 * - FAKE_PING: Fake-Ping durch Joker
 * - MANUAL: Manueller Ping durch Orga
 */
export enum PingSource {
  PERIODIC = 'PERIODIC',
  SPEEDHUNT = 'SPEEDHUNT',
  SILENTHUNT = 'SILENTHUNT',
  FAKE_PING = 'FAKE_PING',
  MANUAL = 'MANUAL',
}

@Entity('pings')
@Index(['gameId', 'participantId'])
@Index(['gameId', 'source'])
export class Ping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({ name: 'participant_id' })
  participantId: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    name: 'actual_location',
  })
  actualLocation: Point;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    name: 'revealed_location',
    nullable: true,
  })
  revealedLocation: Point;

  @Column({ name: 'radius_meters', type: 'int', default: 200 })
  radiusMeters: number;

  @Column({ type: 'timestamptz' })
  @Index()
  timestamp: Date;

  @Column({ name: 'revealed_at', type: 'timestamptz', nullable: true })
  revealedAt: Date;

  @Column({
    type: 'enum',
    enum: PingSource,
    default: PingSource.PERIODIC,
  })
  source: PingSource;

  @Column({ name: 'is_fake', default: false })
  isFake: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Game, (game) => game.pings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @ManyToOne(() => GameParticipant)
  @JoinColumn({ name: 'participant_id' })
  participant: GameParticipant;
}
