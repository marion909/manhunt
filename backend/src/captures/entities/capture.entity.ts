import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Game } from '../../games/entities/game.entity';
import { User } from '../../users/entities/user.entity';

export enum CaptureStatus {
  PENDING = 'PENDING',
  PENDING_HANDCUFF = 'PENDING_HANDCUFF', // QR scanned, waiting for handcuff photo (Rulebook)
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

@Entity('captures')
@Index(['gameId'])
@Index(['hunterId'])
@Index(['playerId'])
@Index(['status'])
export class Capture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({ name: 'hunter_id', nullable: true })
  hunterId: string;

  @Column({ name: 'player_id', nullable: true })
  playerId: string;

  // Store participant IDs (some participants don't have user accounts)
  @Column({ name: 'hunter_participant_id', nullable: true })
  hunterParticipantId: string;

  @Column({ name: 'player_participant_id', nullable: true })
  playerParticipantId: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    name: 'capture_location',
  })
  captureLocation: string; // WKT format: 'POINT(longitude latitude)'

  @Column({ type: 'float', name: 'distance_meters' })
  distanceMeters: number;

  @Column({
    type: 'enum',
    enum: CaptureStatus,
    default: CaptureStatus.PENDING,
  })
  status: CaptureStatus;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl: string;

  // Handcuff documentation (Rulebook: hunter must apply handcuff and take photo)
  @Column({ name: 'handcuff_applied', default: false })
  handcuffApplied: boolean;

  @Column({ name: 'handcuff_photo_url', nullable: true })
  handcuffPhotoUrl: string;

  @Column({ name: 'capture_photo_url', nullable: true })
  capturePhotoUrl: string; // Photo of the actual capture moment

  @Column({ name: 'confirmed_by', nullable: true })
  confirmedBy: string; // User ID of orga who confirmed/rejected

  @Column({ name: 'initiated_at', type: 'timestamptz' })
  initiatedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'hunter_id' })
  hunter: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'player_id' })
  player: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'confirmed_by' })
  confirmer: User;
}
