import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { v5 as uuidv5 } from 'uuid';
import { ChatService, ChatSender } from './chat.service';
import { GamesService } from '../games/games.service';
import { SendMessageDto } from './dto/send-message.dto';
import { Role } from '../common/enums';
import { ChatChannel, MessageType } from '../common/enums/chat-channel.enum';

interface ChatSocket extends Socket {
  participantId?: string;
  userId?: string;
  gameId?: string;
  role?: Role;
  displayName?: string;
  isHunterToken?: boolean;
  hunterToken?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private chatService: ChatService,
    private gamesService: GamesService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(client: ChatSocket) {
    console.log(`[Chat] Client connected: ${client.id}`);

    const token = client.handshake.auth?.token;
    const participantId = client.handshake.auth?.participantId;
    const hunterToken = client.handshake.auth?.hunterToken;
    const hunterGameId = client.handshake.auth?.gameId;

    // Hunter token authentication (public hunter dashboard)
    if (hunterToken && hunterGameId) {
      try {
        const result = await this.gamesService.validateHunterToken(hunterGameId, hunterToken);
        if (result.valid) {
          client.isHunterToken = true;
          client.hunterToken = hunterToken;
          client.gameId = hunterGameId;
          client.role = Role.HUNTER;
          client.displayName = 'Hunter Dashboard';
          // Generate consistent UUID from hunter token using namespace UUID
          const HUNTER_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace
          client.participantId = uuidv5(`hunter-${hunterToken}`, HUNTER_NAMESPACE);
          console.log('[Chat] Hunter token authenticated for game:', hunterGameId);
          return;
        }
      } catch (error) {
        console.log('[Chat] Hunter token validation failed:', error);
      }
      client.disconnect();
      return;
    }

    if (!token && !participantId) {
      console.log('[Chat] No auth token or participantId, disconnecting');
      client.disconnect();
      return;
    }

    // Store participantId if provided (mobile app)
    if (participantId) {
      client.participantId = participantId;
    }

    // Decode JWT token (web app) - this contains userId, not participantId
    if (token) {
      try {
        const decoded = this.jwtService.verify(token);
        client.userId = decoded.sub; // Store userId from JWT
        console.log('[Chat] JWT decoded, userId:', decoded.sub);
      } catch (error) {
        console.log('[Chat] JWT verification failed');
      }
    }
  }

  handleDisconnect(client: ChatSocket) {
    console.log(`[Chat] Client disconnected: ${client.id}`);
    if (client.gameId) {
      // Leave all rooms
      client.leave(`game:${client.gameId}`);
      client.leave(`game:${client.gameId}:hunters`);
      client.leave(`game:${client.gameId}:players`);
      client.leave(`game:${client.gameId}:orga`);
    }
  }

  @SubscribeMessage('join:chat')
  async handleJoinChat(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() data: { gameId: string; participantId?: string },
  ) {
    const { gameId, participantId } = data;
    console.log('[Chat] join:chat received:', { gameId, participantId, userId: client.userId, isHunterToken: client.isHunterToken });

    // Hunter token authenticated - set up as hunter and join rooms
    if (client.isHunterToken && client.gameId === gameId) {
      // Set required fields on socket for message sending
      // Generate consistent UUID from hunter token using namespace UUID
      const HUNTER_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      client.participantId = uuidv5(`hunter-${client.hunterToken || 'unknown'}`, HUNTER_NAMESPACE);
      client.role = Role.HUNTER;
      client.displayName = 'Hunter Dashboard';
      
      client.join(`game:${gameId}`);
      client.join(`game:${gameId}:hunters`);
      
      // Send recent messages (hunters + orga channels only)
      const messages = await this.chatService.getMessages(gameId, undefined, 50);
      const hunterMessages = messages.filter(
        (msg) => msg.channel === ChatChannel.HUNTERS || msg.channel === ChatChannel.ORGA || msg.channel === ChatChannel.GLOBAL
      );
      const transformedMessages = hunterMessages.map((msg) => ({
        id: msg.id,
        gameId: msg.gameId,
        channel: msg.channel,
        messageType: msg.messageType,
        content: msg.content,
        senderId: msg.senderId,
        senderDisplayName: msg.sender?.displayName || msg.metadata?.senderDisplayName || `Spieler #${msg.sender?.participantNumber || '?'}`,
        senderRole: msg.sender?.role || msg.metadata?.senderRole,
        recipientId: msg.recipientId,
        recipientDisplayName: msg.recipient?.displayName || (msg.recipientId ? `Spieler #${msg.recipient?.participantNumber || '?'}` : undefined),
        createdAt: msg.createdAt,
        metadata: msg.metadata,
      }));
      client.emit('chat:history', transformedMessages.reverse());
      client.emit('join:chat:success', { gameId, role: Role.HUNTER });
      return;
    }

    // Priority: 1. participantId from message, 2. participantId from socket, 3. lookup by userId
    let participant = null;
    
    if (participantId) {
      participant = await this.gamesService.getParticipantById(participantId);
    } else if (client.participantId) {
      participant = await this.gamesService.getParticipantById(client.participantId);
    } else if (client.userId) {
      // Web app: lookup participant by userId and gameId
      participant = await this.gamesService.findParticipantByUserId(gameId, client.userId);
    }

    if (!participant || participant.gameId !== gameId) {
      console.log('[Chat] Not a participant in this game:', { gameId, userId: client.userId, participantId });
      client.emit('error', { message: 'Not a participant in this game' });
      return;
    }

    // Store info on socket
    client.participantId = participant.id;
    client.gameId = gameId;
    client.role = participant.role;
    client.displayName = participant.displayName || `Participant #${participant.participantNumber}`;

    // Join appropriate rooms based on role
    client.join(`game:${gameId}`); // Global room

    if (participant.role === Role.ORGA || participant.role === Role.OPERATOR) {
      client.join(`game:${gameId}:orga`);
      client.join(`game:${gameId}:hunters`);
      client.join(`game:${gameId}:players`);
    } else if (participant.role === Role.HUNTER) {
      client.join(`game:${gameId}:hunters`);
    } else if (participant.role === Role.PLAYER) {
      client.join(`game:${gameId}:players`);
    }

    // Send recent messages
    const messages = await this.chatService.getMessages(gameId, undefined, 50);
    // Transform messages to include displayNames
    const transformedMessages = messages.map((msg) => ({
      id: msg.id,
      gameId: msg.gameId,
      channel: msg.channel,
      messageType: msg.messageType,
      content: msg.content,
      senderId: msg.senderId,
      senderDisplayName: msg.sender?.displayName || msg.metadata?.senderDisplayName || `Spieler #${msg.sender?.participantNumber || '?'}`,
      senderRole: msg.sender?.role || msg.metadata?.senderRole,
      recipientId: msg.recipientId,
      recipientDisplayName: msg.recipient?.displayName || (msg.recipientId ? `Spieler #${msg.recipient?.participantNumber || '?'}` : undefined),
      createdAt: msg.createdAt,
      metadata: msg.metadata,
    }));
    client.emit('chat:history', transformedMessages.reverse());

    client.emit('join:chat:success', { gameId, role: participant.role });
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    const { participantId, gameId, role, displayName } = client;

    if (!participantId || !gameId || !role) {
      client.emit('error', { message: 'Not joined to chat' });
      return;
    }

    const sender: ChatSender = {
      participantId,
      gameId,
      role,
      displayName: displayName || 'Unknown',
      isVirtualSender: client.isHunterToken || false, // Hunter Dashboard has no real DB participant
    };

    try {
      const message = await this.chatService.saveMessage(
        sender,
        data.channel,
        data.content,
        data.messageType || MessageType.TEXT,
        data.recipientId,
      );

      // Get recipient display name if this is a direct message
      let recipientDisplayName: string | undefined;
      if (data.recipientId) {
        const recipient = await this.gamesService.getParticipantById(data.recipientId);
        recipientDisplayName = recipient?.displayName || `Spieler #${recipient?.participantNumber}`;
      }

      // Transform for client
      const messageData = {
        id: message.id,
        channel: message.channel,
        content: message.content,
        messageType: message.messageType,
        senderId: message.senderId,
        senderDisplayName: displayName,
        senderRole: role,
        recipientId: message.recipientId,
        recipientDisplayName,
        createdAt: message.createdAt.toISOString(),
      };

      // Emit to appropriate room(s)
      this.broadcastMessage(gameId, data.channel, messageData, data.recipientId, participantId);

      client.emit('message:sent', messageData);
    } catch (error) {
      console.error('[Chat] Failed to send message:', error);
      client.emit('error', { message: error.message || 'Failed to send message' });
    }
  }

  private broadcastMessage(
    gameId: string,
    channel: ChatChannel,
    messageData: any,
    recipientId?: string,
    senderId?: string,
  ) {
    switch (channel) {
      case ChatChannel.GLOBAL:
        this.server.to(`game:${gameId}`).emit('message:new', messageData);
        break;

      case ChatChannel.ORGA:
        this.server.to(`game:${gameId}:orga`).emit('message:new', messageData);
        // Also send to the sender if not ORGA (so they see their own message)
        break;

      case ChatChannel.HUNTERS:
        this.server.to(`game:${gameId}:hunters`).emit('message:new', messageData);
        break;

      case ChatChannel.PLAYERS:
        this.server.to(`game:${gameId}:players`).emit('message:new', messageData);
        break;

      case ChatChannel.DIRECT:
        // Send to recipient + sender + ORGA (for monitoring)
        if (recipientId) {
          // Send to all sockets in game, let client filter
          // This ensures ORGA can monitor all direct messages
          this.server.to(`game:${gameId}`).emit('message:direct', {
            ...messageData,
            forParticipant: recipientId,
            fromParticipant: senderId,
          });
          // Also send to ORGA room specifically
          this.server.to(`game:${gameId}:orga`).emit('message:direct', {
            ...messageData,
            forParticipant: recipientId,
            fromParticipant: senderId,
            isOrgaMonitoring: true,
          });
        }
        break;
    }
  }

  @SubscribeMessage('messages:get')
  async handleGetMessages(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() data: { channel?: ChatChannel; limit?: number; before?: string },
  ) {
    const { gameId } = client;

    if (!gameId) {
      client.emit('error', { message: 'Not joined to chat' });
      return;
    }

    const messages = await this.chatService.getMessages(
      gameId,
      data.channel,
      data.limit || 50,
      data.before,
    );

    // Transform messages to include displayNames
    const transformedMessages = messages.map((msg) => ({
      id: msg.id,
      gameId: msg.gameId,
      channel: msg.channel,
      messageType: msg.messageType,
      content: msg.content,
      senderId: msg.senderId,
      senderDisplayName: msg.sender?.displayName || msg.metadata?.senderDisplayName || `Spieler #${msg.sender?.participantNumber || '?'}`,
      senderRole: msg.sender?.role || msg.metadata?.senderRole,
      recipientId: msg.recipientId,
      recipientDisplayName: msg.recipient?.displayName || (msg.recipientId ? `Spieler #${msg.recipient?.participantNumber || '?'}` : undefined),
      createdAt: msg.createdAt,
      metadata: msg.metadata,
    }));

    client.emit('messages:list', transformedMessages.reverse());
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() data: { channel: ChatChannel },
  ) {
    const { gameId, participantId, displayName } = client;

    if (!gameId || !participantId) return;

    const typingData = { participantId, displayName, channel: data.channel };

    switch (data.channel) {
      case ChatChannel.GLOBAL:
        client.to(`game:${gameId}`).emit('typing:start', typingData);
        break;
      case ChatChannel.HUNTERS:
        client.to(`game:${gameId}:hunters`).emit('typing:start', typingData);
        break;
      case ChatChannel.PLAYERS:
        client.to(`game:${gameId}:players`).emit('typing:start', typingData);
        break;
      case ChatChannel.ORGA:
        client.to(`game:${gameId}:orga`).emit('typing:start', typingData);
        break;
    }
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() data: { channel: ChatChannel },
  ) {
    const { gameId, participantId } = client;

    if (!gameId || !participantId) return;

    const typingData = { participantId, channel: data.channel };

    switch (data.channel) {
      case ChatChannel.GLOBAL:
        client.to(`game:${gameId}`).emit('typing:stop', typingData);
        break;
      case ChatChannel.HUNTERS:
        client.to(`game:${gameId}:hunters`).emit('typing:stop', typingData);
        break;
      case ChatChannel.PLAYERS:
        client.to(`game:${gameId}:players`).emit('typing:stop', typingData);
        break;
      case ChatChannel.ORGA:
        client.to(`game:${gameId}:orga`).emit('typing:stop', typingData);
        break;
    }
  }

  @SubscribeMessage('leave:chat')
  handleLeaveChat(@ConnectedSocket() client: ChatSocket) {
    if (client.gameId) {
      client.leave(`game:${client.gameId}`);
      client.leave(`game:${client.gameId}:hunters`);
      client.leave(`game:${client.gameId}:players`);
      client.leave(`game:${client.gameId}:orga`);
      client.gameId = undefined;
      client.participantId = undefined;
      client.role = undefined;
    }
    client.emit('leave:chat:success');
  }

  // Helper: Broadcast system message
  async broadcastSystemMessage(gameId: string, channel: ChatChannel, content: string) {
    const message = await this.chatService.createSystemMessage(gameId, channel, content);
    
    const messageData = {
      id: message.id,
      channel: message.channel,
      content: message.content,
      messageType: MessageType.SYSTEM,
      createdAt: message.createdAt.toISOString(),
    };

    this.broadcastMessage(gameId, channel, messageData);
  }
}
