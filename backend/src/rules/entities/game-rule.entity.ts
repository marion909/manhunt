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
  PLAYER_TEXT_CHAT = 'PLAYER_TEXT_CHAT',
  PLAYER_VOICE_CHAT = 'PLAYER_VOICE_CHAT',
  // New game mechanic rules
  SILENTHUNT = 'SILENTHUNT', // Periodic pings at full hours, configurable per zone
  SPEEDHUNT = 'SPEEDHUNT', // Hunter-triggered ping bursts on specific players
  REGENERATION = 'REGENERATION', // Player protection - blocks pings for duration
  HUNTER_ANFRAGEN = 'HUNTER_ANFRAGEN', // Player can request hunter positions (one-time)
  // Rulebook Jokers/Bonuses
  CATCH_FREE = 'CATCH_FREE', // 3 hours capture immunity (Rulebook: Catch-Free-Bonus)
  FAKE_PING = 'FAKE_PING', // Player can send false location once (Rulebook: Fake-Ping)
  HOTEL_BONUS = 'HOTEL_BONUS', // 6 hours ping protection, then auto-ping (Rulebook: Hotel-Bonus)
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
