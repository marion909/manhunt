import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Game } from '../../games/entities/game.entity';

export enum RuleType {
  BOUNDARY_VIOLATION = 'BOUNDARY_VIOLATION',
  SPEED_LIMIT = 'SPEED_LIMIT',
  NIGHT_MODE = 'NIGHT_MODE',
  CAPTURE_RADIUS = 'CAPTURE_RADIUS',
  INACTIVITY = 'INACTIVITY',
}

export enum RuleAction {
  LOG = 'LOG',
  WARN = 'WARN',
  DISQUALIFY = 'DISQUALIFY',
}

@Entity('game_rules')
export class GameRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({
    type: 'enum',
    enum: RuleType,
    name: 'rule_type',
  })
  ruleType: RuleType;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({
    type: 'jsonb',
    default: {},
  })
  config: Record<string, any>;

  @Column({
    type: 'enum',
    enum: RuleAction,
    default: RuleAction.LOG,
  })
  action: RuleAction;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Game, (game) => game.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;
}
