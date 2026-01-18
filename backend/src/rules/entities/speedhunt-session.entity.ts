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

export enum SpeedhuntStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Tracks active and completed Speedhunt sessions
 * Hunters can trigger a speedhunt to request multiple pings from a specific player
 */
@Entity('speedhunt_sessions')
@Index(['gameId', 'status'])
@Index(['targetParticipantId', 'status'])
@Index(['hunterParticipantId', 'status'])
export class SpeedhuntSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  /**
   * The hunter who initiated this speedhunt
   * Can be a real participant UUID or a virtual ID like "hunter-dashboard-xxx"
   */
  @Column({ name: 'hunter_participant_id', type: 'varchar', length: 255 })
  hunterParticipantId: string;

  /**
   * The player being targeted by this speedhunt
   */
  @Column({ name: 'target_participant_id' })
  targetParticipantId: string;

  /**
   * Total number of pings allowed in this speedhunt (from game config)
   */
  @Column({ name: 'total_pings' })
  totalPings: number;

  /**
   * Number of pings already requested/used
   */
  @Column({ name: 'used_pings', default: 0 })
  usedPings: number;

  @Column({
    type: 'enum',
    enum: SpeedhuntStatus,
    default: SpeedhuntStatus.ACTIVE,
  })
  status: SpeedhuntStatus;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  /**
   * Flexible metadata (e.g., notification status, ping timestamps)
   */
  @Column({
    type: 'jsonb',
    default: {},
  })
  metadata: Record<string, any>;

  // Relations
  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  // Note: hunter relation removed - hunterParticipantId can be a virtual ID

  @ManyToOne(() => GameParticipant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_participant_id' })
  target: GameParticipant;

  // Computed property
  get remainingPings(): number {
    return this.totalPings - this.usedPings;
  }
}
