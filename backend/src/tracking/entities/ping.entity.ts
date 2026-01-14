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

@Entity('pings')
@Index(['gameId', 'participantId'])
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
