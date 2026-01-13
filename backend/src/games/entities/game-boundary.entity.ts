import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BoundaryType } from '../../common/enums';
import { Game } from './game.entity';
import type { Geometry } from 'geojson';

@Entity('game_boundaries')
export class GameBoundary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({ nullable: true })
  name: string;

  @Column({
    type: 'enum',
    enum: BoundaryType,
  })
  type: BoundaryType;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
  })
  geometry: Geometry;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Game, (game) => game.boundaries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;
}
