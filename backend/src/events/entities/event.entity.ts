import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { EventType, EventSeverity } from '../../common/enums';
import { Game } from '../../games/entities/game.entity';
import { User } from '../../users/entities/user.entity';
import type { Point } from 'geojson';

@Entity('events')
@Index(['gameId', 'eventType'])
@Index(['timestamp'])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: EventType,
    name: 'event_type',
  })
  eventType: EventType;

  @Column({
    type: 'enum',
    enum: EventSeverity,
    default: EventSeverity.INFO,
  })
  severity: EventSeverity;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: Point;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  // Relations
  @ManyToOne(() => Game, (game) => game.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @ManyToOne(() => User, (user) => user.events, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
