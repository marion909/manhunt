import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { GameParticipant } from '../../games/entities/game-participant.entity';
import { Position } from '../../tracking/entities/position.entity';
import { Event } from '../../events/entities/event.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'full_name', nullable: true })
  fullName: string;

  @Column({ nullable: true })
  phone: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => GameParticipant, (participant) => participant.user)
  gameParticipations: GameParticipant[];

  @OneToMany(() => Position, (position) => position.user)
  positions: Position[];

  @OneToMany(() => Event, (event) => event.user)
  events: Event[];
}
