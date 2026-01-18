import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { GameStatus } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { GameParticipant } from './game-participant.entity';
import { GameBoundary } from './game-boundary.entity';
import { Position } from '../../tracking/entities/position.entity';
import { Ping } from '../../tracking/entities/ping.entity';
import { Event } from '../../events/entities/event.entity';
import { Invitation } from '../../invitations/entities/invitation.entity';

@Entity('games')
export class Game {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'creator_id' })
  creatorId: string;

  @Column({
    type: 'enum',
    enum: GameStatus,
    default: GameStatus.DRAFT,
  })
  status: GameStatus;

  @Column({ name: 'start_time', type: 'timestamptz', nullable: true })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime: Date;

  // Game configuration
  @Column({ name: 'ping_interval_minutes', type: 'int', default: 120 })
  pingIntervalMinutes: number;

  @Column({ name: 'capture_radius_meters', type: 'decimal', default: 10 })
  captureRadiusMeters: number;

  @Column({ name: 'night_mode_enabled', default: true })
  nightModeEnabled: boolean;

  @Column({ name: 'night_start_hour', type: 'int', default: 0 })
  nightStartHour: number;

  @Column({ name: 'night_end_hour', type: 'int', default: 6 })
  nightEndHour: number;

  @Column({ name: 'boundary_violation_limit_seconds', type: 'int', default: 900 })
  boundaryViolationLimitSeconds: number; // Rulebook: default 15 minutes

  @Column({ name: 'proximity_danger_meters', type: 'int', default: 200 })
  proximityDangerMeters: number; // Danger zone for proximity alerts

  @Column({ name: 'proximity_warning_meters', type: 'int', default: 500 })
  proximityWarningMeters: number; // Warning zone for proximity alerts

  @Column({ name: 'center_point', type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  centerPoint: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @OneToMany(() => GameParticipant, (participant) => participant.game)
  participants: GameParticipant[];

  @OneToMany(() => GameBoundary, (boundary) => boundary.game)
  boundaries: GameBoundary[];

  @OneToMany(() => Position, (position) => position.game)
  positions: Position[];

  @OneToMany(() => Ping, (ping) => ping.game)
  pings: Ping[];

  @OneToMany(() => Event, (event) => event.game)
  events: Event[];

  @OneToMany(() => Invitation, (invitation) => invitation.game)
  invitations: Invitation[];
}
