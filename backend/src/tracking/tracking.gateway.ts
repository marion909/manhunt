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
import { TrackingService } from './tracking.service';
import { GamesService } from '../games/games.service';
import { PositionUpdateDto } from './dto/position-update.dto';
import { Role } from '../common/enums';

interface AuthSocket extends Socket {
  userId?: string;
  gameId?: string;
  role?: Role;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
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
  ) {}

  async handleConnection(client: AuthSocket) {
    console.log(`Client connected: ${client.id}`);

    // Extract token from handshake
    const token = client.handshake.auth?.token;
    if (!token) {
      client.disconnect();
      return;
    }

    // TODO: Verify JWT token and extract userId
    // For now, accept any connection
    console.log('Connection authenticated');
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
    @MessageBody() data: { gameId: string; userId: string },
  ) {
    const { gameId, userId } = data;

    // Get user's role in game
    const role = await this.gamesService.getUserRole(gameId, userId);
    if (!role) {
      client.emit('error', { message: 'Not a participant in this game' });
      return;
    }

    // Store user info on socket
    client.userId = userId;
    client.gameId = gameId;
    client.role = role;

    // Join game room
    client.join(`game:${gameId}`);

    // Send initial data based on role
    if (role === Role.HUNTER || role === Role.OPERATOR || role === Role.ORGA) {
      // Send all hunter positions
      const hunterPositions = await this.trackingService.getHunterPositions(gameId);
      client.emit('positions:hunters', hunterPositions);

      // Send recent pings
      const pings = await this.trackingService.getPlayerPings(gameId);
      client.emit('pings:players', pings);
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

    if (!gameId) {
      client.emit('error', { message: 'Not joined to a game' });
      return;
    }

    // Only ORGA can manually trigger pings
    if (role !== Role.ORGA) {
      client.emit('error', { message: 'Only ORGA can trigger pings' });
      return;
    }

    const ping = await this.trackingService.generatePing(gameId, data.playerId);

    // Broadcast ping to all
    this.server.to(`game:${gameId}`).emit('ping:new', ping);
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
}
