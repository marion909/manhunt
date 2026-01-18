import * as Location from 'expo-location';
import { apiService } from './api.service';
import { useAuthStore } from '../store/auth.store';

export interface GameRule {
  id: string;
  ruleType: string;
  isEnabled: boolean;
  config?: {
    innerZoneIntervalHours?: number;
    outerZoneIntervalHours?: number;
    radiusMeters?: number;
    [key: string]: unknown;
  };
}

export interface Boundary {
  id: string;
  name: string;
  type: 'inner_zone' | 'outer_zone' | 'game_area';
  active: boolean;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

export type ZoneType = 'INNER_ZONE' | 'OUTER_ZONE' | 'OUTSIDE';

class SilenthuntService {
  private currentLocation: Location.LocationObject | null = null;
  private boundaries: Boundary[] = [];
  private silenthuntRule: GameRule | null = null;
  private nextPingTime: Date | null = null;
  private lastPingTime: Date | null = null;
  private gameStartTime: Date | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize the service by loading game rules and boundaries
   */
  async initialize(gameId: string): Promise<boolean> {
    try {
      console.log('[SilenthuntService] Initializing...');
      
      const hostname = useAuthStore.getState().hostname;
      const token = useAuthStore.getState().token;
      
      if (!hostname) {
        console.error('[SilenthuntService] No hostname configured');
        return false;
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Load boundaries (use player endpoint)
      const boundariesResponse = await fetch(
        `http://${hostname}:3000/api/tracking/games/${gameId}/player/boundaries`,
        { headers }
      );
      
      if (boundariesResponse.ok) {
        this.boundaries = await boundariesResponse.json();
        console.log('[SilenthuntService] Loaded boundaries:', this.boundaries.length);
      } else {
        console.error('[SilenthuntService] Failed to load boundaries:', boundariesResponse.status);
      }

      // Load game rules (use player endpoint)
      const rulesResponse = await fetch(
        `http://${hostname}:3000/api/tracking/games/${gameId}/player/rules`,
        { headers }
      );
      
      if (rulesResponse.ok) {
        const rules: GameRule[] = await rulesResponse.json();
        this.silenthuntRule = rules.find(r => r.ruleType === 'SILENTHUNT' && r.isEnabled) || null;
        console.log('[SilenthuntService] SILENTHUNT rule:', this.silenthuntRule ? 'enabled' : 'disabled');
        
        if (this.silenthuntRule) {
          console.log('[SilenthuntService] Config:', this.silenthuntRule.config);
        }
      } else {
        console.error('[SilenthuntService] Failed to load rules:', rulesResponse.status);
      }

      // Load game info to get start time
      const gameResponse = await fetch(
        `http://${hostname}:3000/api/games/${gameId}`,
        { headers }
      );
      
      if (gameResponse.ok) {
        const game = await gameResponse.json();
        this.gameStartTime = new Date(game.startTime);
        console.log('[SilenthuntService] Game start time:', this.gameStartTime.toISOString());
      } else {
        console.error('[SilenthuntService] Failed to load game info:', gameResponse.status);
      }

      return this.silenthuntRule !== null;
    } catch (error) {
      console.error('[SilenthuntService] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Check if point is inside a polygon using ray casting algorithm
   */
  private isPointInPolygon(point: [number, number], polygon: number[][][]): boolean {
    const [lng, lat] = point;
    const ring = polygon[0]; // Use outer ring only
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Determine which zone the current location is in
   */
  getCurrentZone(): ZoneType {
    if (!this.currentLocation) {
      console.log('[SilenthuntService] getCurrentZone: No location available');
      return 'OUTSIDE';
    }

    const point: [number, number] = [
      this.currentLocation.coords.longitude,
      this.currentLocation.coords.latitude
    ];

    console.log('[SilenthuntService] getCurrentZone: Checking point:', point);
    console.log('[SilenthuntService] getCurrentZone: Available boundaries:', this.boundaries.length);

    // Check inner zone first (highest priority)
    const innerZone = this.boundaries.find(b => b.type === 'inner_zone' && b.active);
    if (innerZone) {
      console.log('[SilenthuntService] getCurrentZone: Checking INNER_ZONE:', innerZone.name || innerZone.id);
      const isInside = this.isPointInPolygon(point, innerZone.geometry.coordinates);
      console.log('[SilenthuntService] getCurrentZone: INNER_ZONE result:', isInside);
      if (isInside) {
        return 'INNER_ZONE';
      }
    }

    // Then check outer zone
    const outerZone = this.boundaries.find(b => b.type === 'outer_zone' && b.active);
    if (outerZone) {
      console.log('[SilenthuntService] getCurrentZone: Checking OUTER_ZONE:', outerZone.name || outerZone.id);
      const isInside = this.isPointInPolygon(point, outerZone.geometry.coordinates);
      console.log('[SilenthuntService] getCurrentZone: OUTER_ZONE result:', isInside);
      if (isInside) {
        return 'OUTER_ZONE';
      }
    }

    console.log('[SilenthuntService] getCurrentZone: Not in any zone - OUTSIDE');
    return 'OUTSIDE';
  }

  /**
   * Get the ping interval in hours based on current zone
   */
  getIntervalHours(): number {
    if (!this.silenthuntRule || !this.silenthuntRule.config) {
      return 1; // Default 1 hour
    }

    const zone = this.getCurrentZone();
    const config = this.silenthuntRule.config;

    switch (zone) {
      case 'INNER_ZONE':
        return config.innerZoneIntervalHours || 1;
      case 'OUTER_ZONE':
        return config.outerZoneIntervalHours || 2;
      default:
        return config.outerZoneIntervalHours || 2; // Outside = use outer zone interval
    }
  }

  /**
   * Calculate next ping time based on last ping or game start time
   * If a ping was already sent, calculate from last ping time
   * Otherwise, calculate from game start time
   * Example: Last ping 8:00, outer zone (2h) → next ping 10:00
   */
  calculateNextPingTime(): Date | null {
    if (!this.gameStartTime) {
      console.warn('[SilenthuntService] No game start time, cannot calculate next ping');
      return null;
    }

    const zone = this.getCurrentZone();
    const intervalHours = this.getIntervalHours();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const now = new Date().getTime();
    
    console.log('[SilenthuntService] calculateNextPingTime DEBUG:');
    console.log('  - Current zone:', zone);
    console.log('  - Interval for this zone:', intervalHours, 'hours');
    console.log('  - Game start:', this.gameStartTime.toISOString());
    console.log('  - Last ping:', this.lastPingTime?.toISOString() || 'none');
    console.log('  - Current time:', new Date(now).toISOString());
    
    // If we have a last ping time, calculate from that
    if (this.lastPingTime) {
      const lastPing = this.lastPingTime.getTime();
      const nextPingTime = lastPing + intervalMs;
      
      console.log('  - Calculating from last ping');
      console.log('  - Next ping calculated:', new Date(nextPingTime).toISOString());
      
      return new Date(nextPingTime);
    }
    
    // Otherwise, calculate from game start
    const gameStart = this.gameStartTime.getTime();
    const timeSinceStart = now - gameStart;
    const intervalsPassed = Math.floor(timeSinceStart / intervalMs);
    
    console.log('  - Time since start:', Math.round(timeSinceStart / 1000 / 60), 'minutes');
    console.log('  - Intervals passed:', intervalsPassed);
    
    let nextPingTime = gameStart + (intervalsPassed + 1) * intervalMs;
    
    // If that's still in the past (edge case), add another interval
    if (nextPingTime <= now) {
      console.log('  - Next ping was in the past, adding another interval');
      nextPingTime = gameStart + (intervalsPassed + 2) * intervalMs;
    }
    
    const nextPing = new Date(nextPingTime);
    console.log('  - Next ping calculated:', nextPing.toISOString());
    
    return nextPing;
  }

  /**
   * Update current location
   */
  updateLocation(location: Location.LocationObject) {
    console.log('[SilenthuntService] updateLocation:', {
      lat: location.coords.latitude,
      lng: location.coords.longitude
    });
    
    this.currentLocation = location;
    
    // Recalculate next ping time when zone changes
    const zone = this.getCurrentZone();
    console.log('[SilenthuntService] Current zone after location update:', zone);
    
    const newNextPing = this.calculateNextPingTime();
    if (newNextPing && (!this.nextPingTime || Math.abs(newNextPing.getTime() - this.nextPingTime.getTime()) > 60000)) {
      this.nextPingTime = newNextPing;
      console.log('[SilenthuntService] Next ping time updated:', this.nextPingTime.toISOString());
    }
  }

  /**
   * Get next ping time
   */
  getNextPingTime(): Date | null {
    if (!this.nextPingTime) {
      this.nextPingTime = this.calculateNextPingTime();
    }
    return this.nextPingTime;
  }

  /**
   * Get remaining time until next ping
   */
  getRemainingMinutes(): number {
    const nextPing = this.getNextPingTime();
    if (!nextPing) return 0;
    
    const now = new Date();
    const diff = nextPing.getTime() - now.getTime();
    return Math.max(0, Math.floor(diff / 60000));
  }

  /**
   * Check if it's time to send a ping
   */
  shouldSendPing(): boolean {
    const nextPing = this.getNextPingTime();
    if (!nextPing) {
      console.log('[SilenthuntService] shouldSendPing: No next ping time');
      return false;
    }
    
    const now = new Date();
    const diff = nextPing.getTime() - now.getTime();
    
    // Trigger if time has passed OR if less than 5 seconds remaining
    const shouldSend = diff <= 5000;
    
    console.log('[SilenthuntService] shouldSendPing:', {
      now: now.toISOString(),
      nextPing: nextPing.toISOString(),
      diffMs: diff,
      shouldSend
    });
    
    return shouldSend;
  }

  /**
   * Send SILENTHUNT ping
   */
  async sendPing(gameId: string): Promise<boolean> {
    if (!this.currentLocation) {
      console.error('[SilenthuntService] sendPing: No location available');
      return false;
    }

    const zone = this.getCurrentZone();
    console.log('[SilenthuntService] sendPing: Current zone:', zone);
    
    if (zone === 'OUTSIDE') {
      console.log('[SilenthuntService] sendPing: Player is outside game area, skipping ping');
      return false;
    }

    try {
      const { latitude, longitude } = this.currentLocation.coords;
      
      console.log('[SilenthuntService] sendPing: Sending SILENTHUNT ping at', latitude, longitude);
      const result = await apiService.createPing(gameId, latitude, longitude, 'SILENTHUNT');
      
      if (result.success) {
        console.log('[SilenthuntService] sendPing: SILENTHUNT ping sent successfully, ID:', result.pingId);
        this.lastPingTime = new Date();
        this.nextPingTime = this.calculateNextPingTime();
        console.log('[SilenthuntService] sendPing: Next ping scheduled for:', this.nextPingTime?.toISOString());
        return true;
      } else {
        console.error('[SilenthuntService] sendPing: Failed to send ping:', result.message);
        return false;
      }
    } catch (error) {
      console.error('[SilenthuntService] sendPing: Error sending ping:', error);
      return false;
    }
  }

  /**
   * Start automatic ping checking
   */
  startTimer(gameId: string, onPingSent?: () => void) {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }

    // Check immediately and then every 10 seconds
    const checkAndSend = async () => {
      const shouldSend = this.shouldSendPing();
      const zone = this.getCurrentZone();
      
      console.log('[SilenthuntService] Timer check:', {
        shouldSend,
        zone,
        nextPingTime: this.getNextPingTime()?.toISOString(),
        remainingMinutes: this.getRemainingMinutes()
      });
      
      if (shouldSend) {
        console.log('[SilenthuntService] Time to send ping!');
        const success = await this.sendPing(gameId);
        if (success && onPingSent) {
          onPingSent();
        }
      }
    };

    // Check immediately
    checkAndSend();

    // Then check every 10 seconds
    this.pingTimer = setInterval(checkAndSend, 10000);

    console.log('[SilenthuntService] Timer started (checks every 10s)');
  }

  /**
   * Stop automatic ping checking
   */
  stopTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      console.log('[SilenthuntService] Timer stopped');
    }
  }

  /**
   * Check if SILENTHUNT is enabled
   */
  isEnabled(): boolean {
    return this.silenthuntRule !== null && this.silenthuntRule.isEnabled;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      enabled: this.isEnabled(),
      zone: this.getCurrentZone(),
      intervalHours: this.getIntervalHours(),
      nextPingTime: this.getNextPingTime(),
      remainingMinutes: this.getRemainingMinutes(),
      radiusMeters: this.silenthuntRule?.config?.radiusMeters || 50,
    };
  }
}

export const silenthuntService = new SilenthuntService();
