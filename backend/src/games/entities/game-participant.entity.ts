import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Role, ParticipantStatus } from '../../common/enums';
import { Game } from './game.entity';
import { User } from '../../users/entities/user.entity';

@Entity('game_participants')
export class GameParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: Role,
  })
  role: Role;

  @Column({
    type: 'enum',
    enum: ParticipantStatus,
    default: ParticipantStatus.ACTIVE,
  })
  status: ParticipantStatus;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  // Relations
  @ManyToOne(() => Game, (game) => game.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @ManyToOne(() => User, (user) => user.gameParticipations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
