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
import { VoiceService, VoiceSender } from './voice.service';
import { GamesService } from '../games/games.service';
import { Role } from '../common/enums';
import { ChatChannel } from '../common/enums/chat-channel.enum';

interface VoiceSocket extends Socket {
  participantId?: string;
  userId?: string;
  gameId?: string;
  role?: Role;
  displayName?: string;
  producerId?: string;
  consumerId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/voice',
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private voiceService: VoiceService,
    private gamesService: GamesService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(client: VoiceSocket) {
    console.log(`[Voice] Client connected: ${client.id}`);

    const token = client.handshake.auth?.token;
    const participantId = client.handshake.auth?.participantId;

    if (!token && !participantId) {
      console.log('[Voice] No auth, disconnecting');
      client.disconnect();
      return;
    }

    if (participantId) {
      client.participantId = participantId;
    }

    if (token) {
      try {
        const decoded = this.jwtService.verify(token);
        client.userId = decoded.sub; // Store userId from JWT
        console.log('[Voice] JWT decoded, userId:', decoded.sub);
      } catch (error) {
        console.log('[Voice] JWT verification failed');
      }
    }
  }

  async handleDisconnect(client: VoiceSocket) {
    console.log(`[Voice] Client disconnected: ${client.id}`);
    
    if (client.gameId && client.participantId) {
      await this.handleLeaveVoice(client);
    }
  }

  @SubscribeMessage('join:voice')
  async handleJoinVoice(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { gameId: string; channel: ChatChannel; participantId?: string },
  ) {
    const { gameId, channel, participantId } = data;
    console.log('[Voice] join:voice received:', { gameId, channel, participantId, userId: client.userId });

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
      console.log('[Voice] Not a participant in this game:', { gameId, userId: client.userId, participantId });
      client.emit('error', { message: 'Not a participant in this game' });
      return;
    }

    const sender: VoiceSender = {
      participantId: participant.id,
      gameId,
      role: participant.role,
      displayName: participant.displayName || `Participant #${participant.participantNumber}`,
    };

    // Check permission
    const canJoin = await this.voiceService.canJoinVoiceChannel(sender, channel);
    if (!canJoin) {
      client.emit('error', { message: 'You do not have permission to join this voice channel' });
      return;
    }

    // Store info on socket
    client.participantId = participant.id;
    client.gameId = gameId;
    client.role = participant.role;
    client.displayName = sender.displayName;

    // Join voice room
    const roomId = `voice:${gameId}:${channel}`;
    client.join(roomId);

    // Track participant in voice room
    await this.voiceService.joinVoiceRoom(gameId, channel, sender);

    // Get TURN/STUN server config
    const iceServers = this.voiceService.getIceServers();

    // Get current participants in room
    const participants = await this.voiceService.getVoiceRoomParticipants(gameId, channel);

    // Notify others that someone joined
    client.to(roomId).emit('voice:participant:joined', {
      participantId: participant.id,
      displayName: sender.displayName,
      role: participant.role,
    });

    client.emit('join:voice:success', {
      gameId,
      channel,
      iceServers,
      participants,
    });
  }

  @SubscribeMessage('voice:offer')
  async handleOffer(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { targetParticipantId: string; offer: RTCSessionDescriptionInit; channel: ChatChannel },
  ) {
    const { gameId, participantId, displayName } = client;
    if (!gameId || !participantId) return;

    const roomId = `voice:${gameId}:${data.channel}`;
    
    // Forward offer to target participant
    this.server.to(roomId).emit('voice:offer', {
      fromParticipantId: participantId,
      fromDisplayName: displayName,
      targetParticipantId: data.targetParticipantId,
      offer: data.offer,
    });
  }

  @SubscribeMessage('voice:answer')
  async handleAnswer(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { targetParticipantId: string; answer: RTCSessionDescriptionInit; channel: ChatChannel },
  ) {
    const { gameId, participantId } = client;
    if (!gameId || !participantId) return;

    const roomId = `voice:${gameId}:${data.channel}`;
    
    // Forward answer to target participant
    this.server.to(roomId).emit('voice:answer', {
      fromParticipantId: participantId,
      targetParticipantId: data.targetParticipantId,
      answer: data.answer,
    });
  }

  @SubscribeMessage('voice:ice-candidate')
  async handleIceCandidate(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { targetParticipantId: string; candidate: RTCIceCandidateInit; channel: ChatChannel },
  ) {
    const { gameId, participantId } = client;
    if (!gameId || !participantId) return;

    const roomId = `voice:${gameId}:${data.channel}`;
    
    // Forward ICE candidate to target participant
    this.server.to(roomId).emit('voice:ice-candidate', {
      fromParticipantId: participantId,
      targetParticipantId: data.targetParticipantId,
      candidate: data.candidate,
    });
  }

  @SubscribeMessage('voice:mute')
  handleMute(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { channel: ChatChannel; muted: boolean },
  ) {
    const { gameId, participantId, displayName } = client;
    if (!gameId || !participantId) return;

    const roomId = `voice:${gameId}:${data.channel}`;
    
    // Broadcast mute status
    client.to(roomId).emit('voice:mute', {
      participantId,
      displayName,
      muted: data.muted,
    });
  }

  @SubscribeMessage('voice:speaking')
  handleSpeaking(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { channel: ChatChannel; speaking: boolean },
  ) {
    const { gameId, participantId, displayName } = client;
    if (!gameId || !participantId) return;

    const roomId = `voice:${gameId}:${data.channel}`;
    
    // Broadcast speaking status (for active speaker indicator)
    client.to(roomId).emit('voice:speaking', {
      participantId,
      displayName,
      speaking: data.speaking,
    });
  }

  @SubscribeMessage('leave:voice')
  async handleLeaveVoice(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data?: { channel?: ChatChannel },
  ) {
    const { gameId, participantId, displayName } = client;
    if (!gameId || !participantId) return;

    // Get all voice rooms for this game
    const channels = [ChatChannel.GLOBAL, ChatChannel.HUNTERS, ChatChannel.PLAYERS, ChatChannel.ORGA];
    
    for (const channel of channels) {
      const roomId = `voice:${gameId}:${channel}`;
      
      // Leave room
      client.leave(roomId);
      
      // Remove from tracking
      await this.voiceService.leaveVoiceRoom(gameId, channel, participantId);
      
      // Notify others
      this.server.to(roomId).emit('voice:participant:left', {
        participantId,
        displayName,
      });
    }

    client.emit('leave:voice:success');
  }

  @SubscribeMessage('voice:participants')
  async handleGetParticipants(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() data: { channel: ChatChannel },
  ) {
    const { gameId } = client;
    if (!gameId) return;

    const participants = await this.voiceService.getVoiceRoomParticipants(gameId, data.channel);
    client.emit('voice:participants', { channel: data.channel, participants });
  }
}
