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
import { ChatChannel, MessageType } from '../../common/enums/chat-channel.enum';

@Entity('chat_messages')
@Index(['gameId', 'createdAt'])
@Index(['gameId', 'channel'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'game_id' })
  gameId: string;

  @Column({ name: 'sender_id', nullable: true })
  senderId: string;

  @Column({
    type: 'enum',
    enum: ChatChannel,
  })
  channel: ChatChannel;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
    name: 'message_type',
  })
  messageType: MessageType;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'recipient_id', nullable: true })
  recipientId: string; // For DIRECT messages

  @Column({
    type: 'jsonb',
    default: {},
  })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  @ManyToOne(() => GameParticipant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sender_id' })
  sender: GameParticipant;

  @ManyToOne(() => GameParticipant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient: GameParticipant;
}
