import io, { Socket } from 'socket.io-client';
import { locationService } from './location.service';
import { queueService } from './queue.service';
import { useGameStore } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { PositionUpdate } from '../types';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;

  connect(hostname: string): void {
    if (this.socket?.connected) {
      console.log('Already connected to WebSocket');
      return;
    }

    const { participantId } = useAuthStore.getState();
    console.log(`Connecting to ws://${hostname}:3000/tracking with participantId: ${participantId}`);

    this.socket = io(`ws://${hostname}:3000/tracking`, {
      auth: {
        token: '', // Optional JWT token
        participantId: participantId, // Send participantId for mobile auth
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      useGameStore.getState().setConnected(true);

      // Auto-join game if we have a gameId
      const { gameId, participantId } = useAuthStore.getState();
      if (gameId && participantId) {
        console.log('Auto-joining game:', gameId);
        this.joinGame(gameId, participantId);
      }
      // Note: Queue will be flushed after join:success
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      useGameStore.getState().setConnected(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Game events
    this.socket.on('join:success', (data) => {
      console.log('Joined game:', data);
      useAuthStore.getState().setGameId(data.gameId);
      
      // Flush offline queue after successfully joining game
      console.log('Flushing queue after join success');
      queueService.flushQueue(this.socket);
    });

    this.socket.on('positions:hunters', (positions) => {
      console.log('Received initial hunter positions:', positions.length);
      // Update hunter positions in store
      positions.forEach((pos: any) => {
        useGameStore.getState().updateHunterPosition(pos);
      });
    });

    this.socket.on('pings:players', (pings) => {
      console.log('Received initial player pings:', pings.length);
      pings.forEach((ping: any) => {
        useGameStore.getState().updatePlayerPing(ping);
      });
    });

    this.socket.on('position:hunter', (data) => {
      console.log('Hunter position update:', data.userId);
      useGameStore.getState().updateHunterPosition(data);
    });

    this.socket.on('position:player', (data) => {
      console.log('Player ping update:', data);
      // Convert to ping format if needed
      const ping = {
        id: data.position.id,
        gameId: data.position.gameId,
        userId: data.userId,
        playerName: 'Player',
        actualLocation: data.position.location,
        displayLocation: data.position.location,
        offsetDistance: 0,
        createdAt: data.position.timestamp,
      };
      useGameStore.getState().updatePlayerPing(ping);
    });

    this.socket.on('ping:request', () => {
      console.log('Ping requested - sending position immediately');
      this.sendPosition();
    });

    this.socket.on('ping:new', (ping) => {
      console.log('New ping generated:', ping);
      useGameStore.getState().updatePlayerPing(ping);
    });

    this.socket.on('ping:generated', (ping) => {
      console.log('Ping generated:', ping);
      useGameStore.getState().updatePlayerPing(ping);
    });

    this.socket.on('position:saved', (data) => {
      console.log('Position saved at:', data.timestamp);
    });

    this.socket.on('event:new', (event) => {
      console.log('New event:', event.type);
      useGameStore.getState().addEvent(event);
    });

    this.socket.on('event:boundary_violation', (data) => {
      console.log('Boundary violation:', data);
      const event = {
        id: `boundary_${Date.now()}`,
        gameId: useAuthStore.getState().gameId || '',
        type: 'BOUNDARY_VIOLATION' as const,
        severity: 'WARNING' as const,
        message: 'User left game area',
        metadata: data,
        timestamp: new Date().toISOString(),
      };
      useGameStore.getState().addEvent(event);
    });

    this.socket.on('event:emergency', (data) => {
      console.log('Emergency:', data);
      const event = {
        id: `emergency_${Date.now()}`,
        gameId: useAuthStore.getState().gameId || '',
        type: 'EMERGENCY' as const,
        severity: 'CRITICAL' as const,
        message: 'Panic button pressed',
        metadata: data,
        timestamp: new Date().toISOString(),
      };
      useGameStore.getState().addEvent(event);
    });

    this.socket.on('capture:initiated', (capture) => {
      console.log('Capture initiated:', capture);
      const event = {
        id: capture.id,
        gameId: capture.gameId,
        type: 'CAPTURE' as const,
        severity: 'INFO' as const,
        message: 'Capture initiated (pending confirmation)',
        metadata: capture,
        timestamp: new Date().toISOString(),
      };
      useGameStore.getState().addEvent(event);
    });

    this.socket.on('capture:confirmed', (capture) => {
      console.log('Capture confirmed:', capture);
      const event = {
        id: capture.id,
        gameId: capture.gameId,
        type: 'CAPTURE' as const,
        severity: 'INFO' as const,
        message: 'Capture confirmed',
        metadata: capture,
        timestamp: new Date().toISOString(),
      };
      useGameStore.getState().addEvent(event);
    });

    this.socket.on('capture:rejected', (capture) => {
      console.log('Capture rejected:', capture);
    });

    this.socket.on('game:status-changed', (data) => {
      console.log('Game status changed:', data.status);
    });

    this.socket.on('participant:status-changed', (data) => {
      console.log('Participant status changed:', data);
    });
  }

  joinGame(gameId: string, participantId: string): void {
    if (!this.socket?.connected) {
      console.error('Cannot join game: WebSocket not connected');
      return;
    }

    console.log('Joining game:', gameId, 'with participantId:', participantId);
    this.socket.emit('join:game', {
      gameId,
      participantId,
    });
  }

  sendPosition(isEmergency: boolean = false): void {
    const position = locationService.getCurrentPosition();
    if (!position) {
      console.warn('No position available to send');
      return;
    }

    const data: PositionUpdate = {
      ...position,
      isEmergency,
    };

    if (this.socket?.connected) {
      console.log('Sending position:', data);
      this.socket.emit('position:update', data);
    } else {
      console.log('WebSocket not connected, queueing position');
      queueService.addToQueue(data);
    }
  }

  sendPanic(): void {
    console.log('Sending panic position');
    this.sendPosition(true);
  }

  requestPing(playerId: string): void {
    if (!this.socket?.connected) {
      console.error('Cannot request ping: WebSocket not connected');
      return;
    }

    console.log('Requesting ping for player:', playerId);
    this.socket.emit('ping:generate', { playerId });
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting from WebSocket');
      this.socket.emit('leave:game');
      this.socket.disconnect();
      this.socket = null;
      useGameStore.getState().setConnected(false);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const websocketService = new WebSocketService();
