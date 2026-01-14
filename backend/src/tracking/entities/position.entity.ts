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

@Entity('positions')
@Index(['gameId', 'participantId', 'timestamp'])
export class Position {
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
  })
  location: Point;

  @Column({ type: 'decimal', nullable: true })
  accuracy: number;

  @Column({ type: 'decimal', nullable: true })
  altitude: number;

  @Column({ type: 'decimal', nullable: true })
  speed: number;

  @Column({ type: 'decimal', nullable: true })
  heading: number;

  @Column({ type: 'timestamptz' })
  @Index()
  timestamp: Date;

  @Column({ name: 'is_emergency', default: false })
  isEmergency: boolean;

  @Column({ name: 'is_override', default: false })
  isOverride: boolean;

  @Column({ name: 'overridden_by', nullable: true })
  overriddenBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Game, (game) => game.positions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @ManyToOne(() => GameParticipant, (participant) => participant.positions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant_id' })
  participant: GameParticipant;
}
