import { locationService } from './location.service';
import { websocketService } from './websocket.service';
import { apiService } from './api.service';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';

/**
 * PingService - Unified 10-second ping timer for all participants
 * 
 * Sends pings every 10 seconds via WebSocket when connected,
 * falls back to REST API when WebSocket is disconnected.
 */
class PingService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly PING_INTERVAL_MS = 10000; // 10 seconds
  private isRunning = false;

  /**
   * Start the periodic ping timer
   */
  start(): void {
    if (this.isRunning) {
      console.log('[PingService] Already running');
      return;
    }

    console.log('[PingService] Starting 10-second ping timer');
    this.isRunning = true;

    // Send initial ping immediately
    this.sendPing();

    // Then send every 10 seconds
    this.intervalId = setInterval(() => {
      this.sendPing();
    }, this.PING_INTERVAL_MS);
  }

  /**
   * Stop the periodic ping timer
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[PingService] Stopping ping timer');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  /**
   * Send a single ping - uses WebSocket if connected, otherwise REST API
   */
  async sendPing(): Promise<void> {
    const { gameId, participantId } = useAuthStore.getState();
    if (!gameId || !participantId) {
      console.log('[PingService] No gameId or participantId, skipping ping');
      return;
    }

    const position = locationService.getCurrentPosition();
    if (!position) {
      console.log('[PingService] No position available, skipping ping');
      return;
    }

    const isConnected = websocketService.isConnected();
    const { isConnected: storeConnected } = useGameStore.getState();

    if (isConnected && storeConnected) {
      // Use WebSocket
      console.log('[PingService] Sending ping via WebSocket');
      websocketService.sendPosition(false);
    } else {
      // Use REST fallback
      console.log('[PingService] WebSocket disconnected, sending ping via REST API');
      try {
        const result = await apiService.createPing(
          gameId,
          position.latitude,
          position.longitude,
          'PERIODIC'
        );
        if (result.success) {
          console.log('[PingService] REST ping created:', result.pingId);
        } else {
          console.error('[PingService] REST ping failed:', result.message);
        }
      } catch (error) {
        console.error('[PingService] REST ping error:', error);
      }
    }
  }

  /**
   * Check if the ping service is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export const pingService = new PingService();
