import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { TrackingService } from './tracking.service';
import { GamesService } from '../games/games.service';
import { PositionUpdateDto } from './dto/position-update.dto';
import { Role, ParticipantStatus } from '../common/enums';

interface AuthSocket extends Socket {
  userId?: string;
  gameId?: string;
  role?: Role;
  displayName?: string;
  isHunterToken?: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private trackingService: TrackingService,
    private gamesService: GamesService,
    private jwtService: JwtService,
  ) {}

  // Transform ping data to match frontend expectations
  private transformPingForFrontend(ping: any) {
    return {
      id: ping.id,
      gameId: ping.gameId,
      participantId: ping.participantId,
      userId: ping.participantId, // Alias for backwards compatibility
      playerName: ping.participant?.displayName || 'Unknown',
      actualLocation: ping.actualLocation,
      displayLocation: ping.revealedLocation, // Frontend expects displayLocation
      offsetDistance: ping.radiusMeters,
      createdAt: ping.timestamp?.toISOString?.() || ping.timestamp,
    };
  }

  async handleConnection(client: AuthSocket) {
    console.log(`Client connected: ${client.id}`);

    // Extract auth options from handshake
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
          client.gameId = hunterGameId;
          client.role = Role.HUNTER;
          client.displayName = 'Hunter Dashboard';
          console.log('Hunter token authenticated for game:', hunterGameId);
          return;
        }
      } catch (error) {
        console.log('Hunter token validation failed:', error);
      }
      client.disconnect();
      return;
    }
    
    // Allow connections with token OR participantId (for mobile app)
    if (!token && !participantId) {
      console.log('No auth token or participantId, disconnecting');
      client.disconnect();
      return;
    }

    // Store participantId if provided (mobile app)
    if (participantId) {
      client.userId = participantId;
    }

    // Decode JWT token to get userId (web app)
    if (token) {
      try {
        const decoded = this.jwtService.verify(token);
        client.userId = decoded.sub; // userId from JWT
        console.log('JWT decoded, userId:', decoded.sub);
      } catch (error) {
        console.log('JWT verification failed, but allowing connection');
      }
    }

    console.log('Connection authenticated, userId:', client.userId);
  }

  handleDisconnect(client: AuthSocket) {
    console.log(`Client disconnected: ${client.id}`);
    if (client.gameId) {
      client.leave(`game:${client.gameId}`);
    }
  }

  @SubscribeMessage('join:game')
  async handleJoinGame(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { gameId: string; participantId?: string },
  ) {
    const { gameId, participantId } = data;
    console.log('join:game received:', { gameId, participantId, clientUserId: client.userId });

    let role: Role | null = null;
    let displayName = '';

    // If already authenticated via hunter token, use stored values
    if (client.isHunterToken && client.gameId === gameId) {
      role = client.role || Role.HUNTER;
      displayName = client.displayName || 'Hunter Dashboard';
    }

    // If participantId is provided (mobile app), use getParticipantRole
    if (!role && participantId) {
      role = await this.gamesService.getParticipantRole(gameId, participantId);
      if (role) {
        const participant = await this.gamesService.getParticipantById(participantId);
        displayName = participant?.displayName || `Participant #${participant?.participantNumber || '?'}`;
        client.userId = participantId;
      }
    }
    
    // Fallback: use userId from JWT token (web app)
    if (!role && client.userId) {
      role = await this.gamesService.getUserRole(gameId, client.userId);
      if (role) {
        // Get participant info for web user
        const participant = await this.gamesService.findParticipantByUserId(gameId, client.userId);
        displayName = participant?.displayName || participant?.user?.fullName || 'Unknown';
      }
    }

    if (!role) {
      console.log('User not found in game:', { gameId, participantId, userId: client.userId });
      client.emit('error', { message: 'Not a participant in this game' });
      return;
    }

    // Store participant info on socket
    client.gameId = gameId;
    client.role = role;
    client.displayName = displayName;

    // Join game room
    client.join(`game:${gameId}`);

    // Send initial data based on role
    if (role === Role.HUNTER || role === Role.OPERATOR || role === Role.ORGA) {
      // Send all hunter positions
      const hunterPositions = await this.trackingService.getHunterPositions(gameId);
      client.emit('positions:hunters', hunterPositions);

      // Send recent pings (transformed to match frontend expectations)
      const pings = await this.trackingService.getPlayerPings(gameId);
      const transformedPings = pings.map(ping => this.transformPingForFrontend(ping));
      client.emit('pings:players', transformedPings);
    }

    client.emit('join:success', { gameId, role });
  }

  @SubscribeMessage('position:update')
  async handlePositionUpdate(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() positionDto: PositionUpdateDto,
  ) {
    const { userId, gameId, role } = client;

    if (!userId || !gameId) {
      client.emit('error', { message: 'Not joined to a game' });
      return;
    }

    // Save position
    const position = await this.trackingService.savePosition(gameId, userId, positionDto);

    // Check boundary violation
    const isViolation = await this.trackingService.checkBoundaryViolation(gameId, userId);
    if (isViolation) {
      this.server.to(`game:${gameId}`).emit('event:boundary_violation', {
        userId,
        position,
      });
    }

    // Broadcast position based on role
    if (role === Role.HUNTER) {
      // Broadcast hunter position to all in game
      this.server.to(`game:${gameId}`).emit('position:hunter', {
        userId,
        participantId: userId,
        displayName: client.displayName,
        position,
      });
    } else if (role === Role.PLAYER) {
      // Player positions are not broadcast live (only via pings)
      // Just acknowledge receipt
      client.emit('position:saved', { timestamp: position.timestamp });
    }

    // Handle emergency
    if (positionDto.isEmergency) {
      this.server.to(`game:${gameId}`).emit('event:emergency', {
        userId,
        position,
      });
    }
  }

  @SubscribeMessage('ping:generate')
  async handleGeneratePing(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { playerId: string },
  ) {
    const { gameId, role } = client;
    console.log('ping:generate received:', { gameId, role, playerId: data.playerId });

    if (!gameId) {
      client.emit('error', { message: 'Not joined to a game' });
      return;
    }

    // ORGA and OPERATOR can manually trigger pings
    if (role !== Role.ORGA && role !== Role.OPERATOR) {
      console.log('Ping denied - role not authorized:', role);
      client.emit('error', { message: 'Only ORGA or OPERATOR can trigger pings' });
      return;
    }

    try {
      const ping = await this.trackingService.generatePing(gameId, data.playerId);
      const transformedPing = this.transformPingForFrontend(ping);
      console.log('Ping generated:', transformedPing);

      // Broadcast ping to all
      this.server.to(`game:${gameId}`).emit('ping:generated', transformedPing);
      this.server.to(`game:${gameId}`).emit('ping:new', transformedPing);
    } catch (error) {
      console.error('Failed to generate ping:', error);
      client.emit('error', { message: 'Failed to generate ping: ' + error.message });
    }
  }

  // Manual ping for all players (alias for backwards compatibility)
  @SubscribeMessage('manual_ping')
  async handleManualPing(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { gameId: string },
  ) {
    const { role } = client;
    const gameId = data.gameId || client.gameId;
    console.log('manual_ping received:', { gameId, role });

    if (!gameId) {
      client.emit('error', { message: 'Not joined to a game' });
      return;
    }

    // ORGA and OPERATOR can trigger manual pings
    if (role !== Role.ORGA && role !== Role.OPERATOR) {
      console.log('Manual ping denied - role not authorized:', role);
      client.emit('error', { message: 'Only ORGA or OPERATOR can trigger pings' });
      return;
    }

    try {
      // Get all players in the game
      const participants = await this.gamesService.getGameParticipants(gameId);
      const players = participants.filter(p => p.role === Role.PLAYER && p.status === ParticipantStatus.ACTIVE);
      
      console.log('Generating pings for', players.length, 'players');
      
      for (const player of players) {
        try {
          const ping = await this.trackingService.generatePing(gameId, player.id);
          const transformedPing = this.transformPingForFrontend(ping);
          this.server.to(`game:${gameId}`).emit('ping:generated', transformedPing);
          this.server.to(`game:${gameId}`).emit('ping:new', transformedPing);
        } catch (playerError) {
          console.error(`Failed to generate ping for player ${player.id}:`, playerError);
        }
      }
      
      client.emit('manual_ping:success', { count: players.length });
    } catch (error) {
      console.error('Failed to generate manual pings:', error);
      client.emit('error', { message: 'Failed to generate pings: ' + error.message });
    }
  }

  // Test event - allows sending positions for any participant (development only)
  @SubscribeMessage('test:position')
  async handleTestPosition(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { participantId: string; latitude: number; longitude: number; accuracy?: number },
  ) {
    const { gameId } = client;

    if (!gameId) {
      client.emit('error', { message: 'Not joined to a game' });
      return;
    }

    const { participantId, ...positionDto } = data;

    // Get participant by ID (works for both regular and manual participants)
    const participant = await this.gamesService.getParticipantById(participantId);
    if (!participant || participant.gameId !== gameId) {
      client.emit('error', { message: 'Participant not found in game' });
      return;
    }

    // Save position with participantId
    const position = await this.trackingService.savePosition(gameId, participantId, positionDto);

    // Broadcast position based on role (in test mode, broadcast all positions for visibility)
    if (participant.role === Role.HUNTER) {
      this.server.to(`game:${gameId}`).emit('position:hunter', {
        participantId,
        position,
        role: participant.role,
      });
    } else if (participant.role === Role.PLAYER) {
      // In test mode, also broadcast player positions for testing purposes
      this.server.to(`game:${gameId}`).emit('position:player', {
        participantId,
        position,
        role: participant.role,
      });
    }

    client.emit('test:position:success', { participantId, position });
  }

  @SubscribeMessage('leave:game')
  handleLeaveGame(@ConnectedSocket() client: AuthSocket) {
    if (client.gameId) {
      client.leave(`game:${client.gameId}`);
      client.gameId = undefined;
      client.userId = undefined;
      client.role = undefined;
    }
    client.emit('leave:success');
  }

  // Broadcast game status change to all participants
  broadcastGameStatusChange(gameId: string, status: string) {
    this.server.to(`game:${gameId}`).emit('game:status-changed', { status });
  }

  // Broadcast participant status change
  broadcastParticipantStatusChange(gameId: string, userId: string, status: string) {
    this.server.to(`game:${gameId}`).emit('participant:status-changed', { userId, status });
  }

  // Broadcast capture initiation to orga/operators
  broadcastCaptureInitiated(gameId: string, capture: any) {
    this.server.to(`game:${gameId}`).emit('capture:initiated', capture);
  }

  // Broadcast capture confirmed to all participants
  broadcastCaptureConfirmed(gameId: string, capture: any) {
    this.server.to(`game:${gameId}`).emit('capture:confirmed', capture);
  }

  // Broadcast capture rejected
  broadcastCaptureRejected(gameId: string, capture: any) {
    this.server.to(`game:${gameId}`).emit('capture:rejected', capture);
  }

  // Broadcast new event to all participants
  broadcastEvent(gameId: string, event: any) {
    this.server.to(`game:${gameId}`).emit('event:new', event);
  }
}
