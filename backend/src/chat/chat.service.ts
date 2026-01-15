import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatChannel, MessageType } from '../common/enums/chat-channel.enum';
import { Role } from '../common/enums';
import { RulesService } from '../rules/rules.service';
import { RuleType } from '../rules/entities/game-rule.entity';
import { GamesService } from '../games/games.service';

export interface ChatSender {
  participantId: string;
  gameId: string;
  role: Role;
  displayName: string;
  isVirtualSender?: boolean; // true for Hunter Dashboard etc. - no real DB participant
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    private rulesService: RulesService,
    private gamesService: GamesService,
  ) {}

  /**
   * Check if a sender can write to a specific channel
   * Permission rules:
   * - ORGA/OPERATOR: Can write to all channels
   * - HUNTER: Can write to HUNTERS, ORGA, DIRECT (to hunters/orga)
   * - PLAYER: Can write to ORGA always, PLAYERS only if PLAYER_TEXT_CHAT rule is active
   */
  async canSendToChannel(
    sender: ChatSender,
    channel: ChatChannel,
    recipientId?: string,
  ): Promise<boolean> {
    const { role, gameId } = sender;

    // ORGA and OPERATOR can always send to any channel
    if (role === Role.ORGA || role === Role.OPERATOR) {
      return true;
    }

    switch (channel) {
      case ChatChannel.GLOBAL:
        // Only ORGA/OPERATOR can broadcast globally
        return false;

      case ChatChannel.ORGA:
        // Everyone can write to ORGA
        return true;

      case ChatChannel.HUNTERS:
        // Only Hunters (and ORGA) can write to hunters channel
        return role === Role.HUNTER;

      case ChatChannel.PLAYERS:
        // Players can only write if PLAYER_TEXT_CHAT rule is enabled
        if (role !== Role.PLAYER) {
          return false;
        }
        return await this.isPlayerChatEnabled(gameId);

      case ChatChannel.DIRECT:
        // Check recipient role for permission
        if (!recipientId) {
          return false;
        }
        return await this.canSendDirectMessage(sender, recipientId);

      default:
        return false;
    }
  }

  /**
   * Check if PLAYER_TEXT_CHAT rule is enabled for the game
   */
  async isPlayerChatEnabled(gameId: string): Promise<boolean> {
    try {
      const rule = await this.rulesService.findByGameAndType(gameId, RuleType.PLAYER_TEXT_CHAT);
      return rule?.isEnabled ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Check if sender can send direct message to recipient
   */
  async canSendDirectMessage(sender: ChatSender, recipientId: string): Promise<boolean> {
    const { role, gameId } = sender;

    // Get recipient info
    const recipient = await this.gamesService.getParticipantById(recipientId);
    if (!recipient || recipient.gameId !== gameId) {
      return false;
    }

    // ORGA/OPERATOR can message anyone
    if (role === Role.ORGA || role === Role.OPERATOR) {
      return true;
    }

    // Hunters can message other hunters and ORGA
    if (role === Role.HUNTER) {
      return recipient.role === Role.HUNTER || 
             recipient.role === Role.ORGA || 
             recipient.role === Role.OPERATOR;
    }

    // Players can message ORGA always, other players only if rule is active
    if (role === Role.PLAYER) {
      if (recipient.role === Role.ORGA || recipient.role === Role.OPERATOR) {
        return true;
      }
      if (recipient.role === Role.PLAYER) {
        return await this.isPlayerChatEnabled(gameId);
      }
      return false;
    }

    return false;
  }

  /**
   * Save a chat message
   */
  async saveMessage(
    sender: ChatSender,
    channel: ChatChannel,
    content: string,
    messageType: MessageType = MessageType.TEXT,
    recipientId?: string,
    metadata?: Record<string, any>,
  ): Promise<ChatMessage> {
    // Validate permissions
    const canSend = await this.canSendToChannel(sender, channel, recipientId);
    if (!canSend) {
      throw new ForbiddenException('You do not have permission to send messages to this channel');
    }

    // Validate direct message recipient
    if (channel === ChatChannel.DIRECT && !recipientId) {
      throw new BadRequestException('Recipient is required for direct messages');
    }

    // Virtual senders (like Hunter Dashboard) don't have real participant IDs in the DB
    // Set senderId to null but preserve sender info in metadata
    const message = this.chatMessageRepository.create({
      gameId: sender.gameId,
      senderId: sender.isVirtualSender ? null : sender.participantId,
      channel,
      messageType,
      content,
      recipientId,
      metadata: {
        ...metadata,
        senderDisplayName: sender.displayName,
        senderRole: sender.role,
        isVirtualSender: sender.isVirtualSender || false,
        virtualSenderId: sender.isVirtualSender ? sender.participantId : undefined,
      },
    });

    return await this.chatMessageRepository.save(message);
  }

  /**
   * Get messages for a game/channel with pagination
   */
  async getMessages(
    gameId: string,
    channel?: ChatChannel,
    limit: number = 50,
    beforeId?: string,
  ): Promise<ChatMessage[]> {
    const query = this.chatMessageRepository
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .leftJoinAndSelect('msg.recipient', 'recipient')
      .where('msg.gameId = :gameId', { gameId })
      .orderBy('msg.createdAt', 'DESC')
      .take(Math.min(limit, 100));

    if (channel) {
      query.andWhere('msg.channel = :channel', { channel });
    }

    if (beforeId) {
      const beforeMsg = await this.chatMessageRepository.findOne({ where: { id: beforeId } });
      if (beforeMsg) {
        query.andWhere('msg.createdAt < :before', { before: beforeMsg.createdAt });
      }
    }

    return await query.getMany();
  }

  /**
   * Get direct messages between two participants
   */
  async getDirectMessages(
    gameId: string,
    participantId1: string,
    participantId2: string,
    limit: number = 50,
  ): Promise<ChatMessage[]> {
    return await this.chatMessageRepository
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .where('msg.gameId = :gameId', { gameId })
      .andWhere('msg.channel = :channel', { channel: ChatChannel.DIRECT })
      .andWhere(
        '((msg.senderId = :id1 AND msg.recipientId = :id2) OR (msg.senderId = :id2 AND msg.recipientId = :id1))',
        { id1: participantId1, id2: participantId2 },
      )
      .orderBy('msg.createdAt', 'DESC')
      .take(Math.min(limit, 100))
      .getMany();
  }

  /**
   * Create a system message
   */
  async createSystemMessage(
    gameId: string,
    channel: ChatChannel,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<ChatMessage> {
    const message = this.chatMessageRepository.create({
      gameId,
      channel,
      messageType: MessageType.SYSTEM,
      content,
      metadata,
    });

    return await this.chatMessageRepository.save(message);
  }
}
