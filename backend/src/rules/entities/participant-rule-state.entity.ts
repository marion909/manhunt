import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import { RuleType } from './game-rule.entity';

/**
 * Tracks per-participant rule states for rules that have individual activation/usage
 * Examples: Regeneration (one-time protection), Hunter Anfragen (one-time map access)
 */
@Entity('participant_rule_states')
@Index(['participantId', 'ruleType'])
@Unique(['participantId', 'ruleType']) // Only one state per participant per rule type
export class ParticipantRuleState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'participant_id' })
  participantId: string;

  @Column({
    type: 'enum',
    enum: RuleType,
    enumName: 'game_rules_rule_type_enum',
    name: 'rule_type',
  })
  ruleType: RuleType;

  /**
   * Whether this rule has been assigned to the participant by orga
   * Must be true before the participant can activate it
   */
  @Column({ name: 'is_assigned', default: false })
  isAssigned: boolean;

  /**
   * Whether the rule is currently active (e.g., Regeneration timer running)
   */
  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  /**
   * When the rule was activated by the participant (null if never used)
   */
  @Column({ name: 'activated_at', type: 'timestamp', nullable: true })
  activatedAt: Date | null;

  /**
   * When the rule effect expires (for time-limited rules like Regeneration)
   */
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  /**
   * How many times this rule has been used (for daily limits, etc.)
   */
  @Column({ name: 'usage_count', default: 0 })
  usageCount: number;

  /**
   * When the usage count was last reset (for daily resets)
   */
  @Column({ name: 'last_reset_at', type: 'timestamp', nullable: true })
  lastResetAt: Date | null;

  /**
   * Flexible metadata for rule-specific data
   */
  @Column({
    type: 'jsonb',
    default: {},
  })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => GameParticipant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant_id' })
  participant: GameParticipant;
}
