import { useAuthStore } from '../store/auth.store';

export interface Participant {
  id: string;
  displayName: string;
  participantNumber: number;
  role: string;
  status: string;
}

export interface GameRule {
  id: string;
  ruleType: string;
  isEnabled: boolean;
  config?: {
    maxMessages?: number;
    [key: string]: unknown;
  };
}

class ApiService {
  private getBaseUrl(): string {
    const { hostname } = useAuthStore.getState();
    return `http://${hostname}:3000/api`;
  }

  private getBaseUrlWithHost(hostname: string): string {
    return `http://${hostname}:3000/api`;
  }

  private getHeaders(): HeadersInit {
    const { token } = useAuthStore.getState();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Participant login - called after QR scan to get JWT token
  async loginParticipant(hostname: string, gameId: string, participantId: string): Promise<{
    success: boolean;
    token?: string;
    error?: string;
  }> {
    try {
      const url = `${this.getBaseUrlWithHost(hostname)}/auth/participant-login`;
      console.log('[API] Participant login:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, participantId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Login failed' };
      }
      
      const data = await response.json();
      return { success: true, token: data.accessToken };
    } catch (error) {
      console.error('[API] Participant login failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getParticipants(gameId: string): Promise<Participant[]> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/participants`;
      console.log('[API] Fetching participants from:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch participants: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get participants:', error);
      return [];
    }
  }

  // Get game info including status
  async getGameInfo(gameId: string): Promise<{
    id: string;
    name: string;
    status: string;
    startTime?: string;
    endTime?: string;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}`;
      console.log('[API] Fetching game info from:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get game info:', response.status);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get game info:', error);
      return null;
    }
  }

  async getPlayers(gameId: string): Promise<Participant[]> {
    const participants = await this.getParticipants(gameId);
    return participants.filter((p) => p.role.toUpperCase() === 'PLAYER');
  }

  async getGameRules(gameId: string): Promise<GameRule[]> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules`;
      console.log('[API] Fetching rules from:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch rules: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get rules:', error);
      return [];
    }
  }

  async isRuleEnabled(gameId: string, ruleType: string): Promise<boolean> {
    try {
      const rules = await this.getGameRules(gameId);
      const rule = rules.find((r) => r.ruleType === ruleType);
      return rule?.isEnabled ?? false;
    } catch {
      return false;
    }
  }

  async getRuleConfig(gameId: string, ruleType: string): Promise<GameRule | null> {
    try {
      const rules = await this.getGameRules(gameId);
      const rule = rules.find((r) => r.ruleType === ruleType);
      return rule?.isEnabled ? rule : null;
    } catch {
      return null;
    }
  }

  // Regeneration Methods
  async activateRegeneration(gameId: string, participantId: string): Promise<{ success: boolean; expiresAt?: string; message?: string }> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/regeneration/activate`;
      console.log('[API] Activating regeneration:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ participantId }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to activate regeneration' };
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to activate regeneration:', error);
      return { success: false, message: 'Network error' };
    }
  }

  async getRegenerationStatus(gameId: string, participantId: string): Promise<{ 
    isActive: boolean; 
    expiresAt?: string; 
    usageCount: number;
    isAssigned: boolean;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/regeneration/status?participantId=${participantId}`;
      console.log('[API] Getting regeneration status:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get regeneration status:', error);
      return null;
    }
  }

  // Hunter Anfragen Methods
  async activateHunterAnfragen(gameId: string, participantId: string): Promise<{ success: boolean; expiresAt?: string; message?: string }> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-anfragen/activate`;
      console.log('[API] Activating hunter anfragen:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ participantId }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to activate hunter anfragen' };
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to activate hunter anfragen:', error);
      return { success: false, message: 'Network error' };
    }
  }

  async getHunterAnfragenStatus(gameId: string, participantId: string): Promise<{ 
    isActive: boolean; 
    expiresAt?: string; 
    usageCount: number;
    isAssigned: boolean;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-anfragen/status?participantId=${participantId}`;
      console.log('[API] Getting hunter anfragen status:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get hunter anfragen status:', error);
      return null;
    }
  }

  // Get Silenthunt Status (next ping time)
  async getSilenthuntStatus(gameId: string, participantId: string): Promise<{
    enabled: boolean;
    innerZoneIntervalHours?: number;
    outerZoneIntervalHours?: number;
    nextPingAt?: string;
    remainingMinutes?: number;
    currentHour?: number;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/silenthunt/status?participantId=${participantId}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get silenthunt status:', error);
      return null;
    }
  }

  // Get Hunter Positions (for hunters to see other hunters)
  async getHunterPositions(gameId: string): Promise<Array<{
    participantId: string;
    displayName: string;
    latitude: number;
    longitude: number;
    timestamp: string;
  }>> {
    try {
      const { participantId } = useAuthStore.getState();
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-app/other-hunters?participantId=${participantId}`;
      console.log('[API] Getting hunter positions:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get hunter positions:', response.status);
        return [];
      }
      const data = await response.json();
      // Transform GeoJSON location to lat/lng and filter only hunters
      return data
        .filter((pos: any) => pos.role === 'hunter')
        .map((pos: any) => ({
          participantId: pos.participantId,
          displayName: pos.displayName,
          latitude: pos.location?.coordinates?.[1] ?? 0,
          longitude: pos.location?.coordinates?.[0] ?? 0,
          timestamp: pos.timestamp,
        }));
    } catch (error) {
      console.error('[API] Failed to get hunter positions:', error);
      return [];
    }
  }

  // Get Hunter Positions for Player (when Hunter Anfragen is active)
  async getHunterPositionsForPlayer(gameId: string): Promise<Array<{
    participantId: string;
    displayName: string;
    latitude: number;
    longitude: number;
    timestamp: string;
  }>> {
    try {
      const { participantId } = useAuthStore.getState();
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-positions?participantId=${participantId}`;
      console.log('[API] Getting hunter positions for player:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get hunter positions for player:', response.status);
        return [];
      }
      const data = await response.json();
      console.log('[API] Hunter positions response:', JSON.stringify(data, null, 2));
      // Transform GeoJSON location to lat/lng
      return data.map((pos: any) => ({
        participantId: pos.participantId,
        displayName: pos.displayName || `Hunter`,
        latitude: pos.location?.coordinates?.[1] ?? pos.latitude ?? 0,
        longitude: pos.location?.coordinates?.[0] ?? pos.longitude ?? 0,
        timestamp: pos.timestamp,
      }));
    } catch (error) {
      console.error('[API] Failed to get hunter positions for player:', error);
      return [];
    }
  }

  // Get Player Pings for Hunter Map with filters
  async getPlayerPings(
    gameId: string, 
    options?: {
      playerIds?: string[];
      sinceMinutes?: number;
      limit?: number;
    }
  ): Promise<Array<{
    id: string;
    participantId: string;
    playerName: string;
    latitude: number;
    longitude: number;
    createdAt: string;
    role?: string;
  }>> {
    try {
      const { participantId } = useAuthStore.getState();
      let url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-app/pings?participantId=${participantId}`;
      
      // Add filter parameters
      if (options?.playerIds && options.playerIds.length > 0) {
        url += `&playerIds=${options.playerIds.join(',')}`;
      }
      if (options?.sinceMinutes) {
        const since = new Date(Date.now() - options.sinceMinutes * 60 * 1000).toISOString();
        url += `&since=${since}`;
      }
      if (options?.limit) {
        url += `&limit=${options.limit}`;
      }
      
      console.log('[API] Getting player pings:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get pings:', response.status);
        return [];
      }
      const data = await response.json();
      return data.map((ping: any) => ({
        id: ping.id,
        participantId: ping.participantId,
        playerName: ping.playerName,
        latitude: ping.displayLocation?.coordinates?.[1] ?? 0,
        longitude: ping.displayLocation?.coordinates?.[0] ?? 0,
        createdAt: ping.createdAt,
        role: ping.role,
      }));
    } catch (error) {
      console.error('[API] Failed to get pings:', error);
      return [];
    }
  }

  // Get Players list for Hunter filters
  async getPlayersForHunterFilters(gameId: string): Promise<Array<{
    id: string;
    displayName: string;
    status: string;
  }>> {
    try {
      const { participantId } = useAuthStore.getState();
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-app/players?participantId=${participantId}`;
      console.log('[API] Getting players list:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get players:', response.status);
        return [];
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get players:', error);
      return [];
    }
  }

  // Get Game Info for Hunter Map (center point + boundaries)
  async getGameInfoForHunterMap(gameId: string): Promise<{
    centerPoint: { type: string; coordinates: [number, number] } | null;
    boundaries: Array<{
      id: string;
      name: string;
      type: string;
      geometry: any;
      active: boolean;
    }>;
  } | null> {
    try {
      const { participantId } = useAuthStore.getState();
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/hunter-app/game-info?participantId=${participantId}`;
      console.log('[API] Getting game info for hunter map:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get game info:', response.status);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get game info:', error);
      return null;
    }
  }

  // Get Game Info for Player Map (center point + boundaries)
  async getGameInfoForPlayerMap(gameId: string): Promise<{
    centerPoint: { type: string; coordinates: [number, number] } | null;
    boundaries: Array<{
      id: string;
      name: string;
      type: string;
      boundaryType?: string;
      coordinates?: number[][];
      geometry: any;
      active: boolean;
    }>;
  } | null> {
    try {
      const { participantId } = useAuthStore.getState();
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/player-app/game-info?participantId=${participantId}`;
      console.log('[API] Getting game info for player map:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get player game info:', response.status);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get player game info:', error);
      return null;
    }
  }

  // Get Global Speedhunt Status (visible to all players, target hidden)
  async getGlobalSpeedhuntStatus(gameId: string): Promise<{
    active: boolean;
    sessions: Array<{
      id: string;
      currentPing: number;
      totalPings: number;
      remainingPings: number;
      startedAt: string;
    }>;
  }> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/speedhunt/global-status`;
      console.log('[API] Getting global speedhunt status:', url);
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        console.error('[API] Failed to get global speedhunt status:', response.status);
        return { active: false, sessions: [] };
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get global speedhunt status:', error);
      return { active: false, sessions: [] };
    }
  }

  // ========== JOKER APIs ==========

  // Catch-Free Status
  async getCatchFreeStatus(gameId: string, participantId: string): Promise<{
    isActive: boolean;
    expiresAt?: string;
    usageCount: number;
    isAssigned: boolean;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules/jokers/catch-free/${participantId}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get catch-free status:', error);
      return null;
    }
  }

  // Activate Catch-Free
  async activateCatchFree(gameId: string, participantId: string): Promise<{
    success: boolean;
    message?: string;
    expiresAt?: string;
  }> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules/jokers/catch-free/activate`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ gameId, participantId }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message };
      }
      const data = await response.json();
      return { success: true, expiresAt: data.expiresAt };
    } catch (error) {
      console.error('[API] Failed to activate catch-free:', error);
      return { success: false, message: 'Network error' };
    }
  }

  // Hotel-Bonus Status
  async getHotelBonusStatus(gameId: string, participantId: string): Promise<{
    isActive: boolean;
    expiresAt?: string;
    usageCount: number;
    isAssigned: boolean;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules/jokers/hotel-bonus/${participantId}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get hotel-bonus status:', error);
      return null;
    }
  }

  // Activate Hotel-Bonus
  async activateHotelBonus(gameId: string, participantId: string): Promise<{
    success: boolean;
    message?: string;
    expiresAt?: string;
  }> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules/jokers/hotel-bonus/activate`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ gameId, participantId }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message };
      }
      const data = await response.json();
      return { success: true, expiresAt: data.expiresAt };
    } catch (error) {
      console.error('[API] Failed to activate hotel-bonus:', error);
      return { success: false, message: 'Network error' };
    }
  }

  // Fake-Ping Status
  async getFakePingStatus(gameId: string, participantId: string): Promise<{
    usageCount: number;
    used: boolean;
    isAssigned: boolean;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules/jokers/fake-ping/${participantId}`;
      console.log('[API] Getting fake-ping status:', url);
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) {
        console.error('[API] Failed to get fake-ping status:', response.status);
        return null;
      }
      const data = await response.json();
      console.log('[API] Fake-ping status response:', data);
      // Transform backend response to expected format
      return {
        isAssigned: data.assigned ?? data.isAssigned ?? false,
        used: data.used ?? false,
        usageCount: data.used ? 1 : 0,
      };
    } catch (error) {
      console.error('[API] Failed to get fake-ping status:', error);
      return null;
    }
  }

  // Use Fake-Ping
  async useFakePing(gameId: string, participantId: string, lat: number, lng: number): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/rules/jokers/fake-ping/use`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ gameId, participantId, lat, lng }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message };
      }
      return { success: true };
    } catch (error) {
      console.error('[API] Failed to use fake-ping:', error);
      return { success: false, message: 'Network error' };
    }
  }

  // Get participant status (for overlay state)
  async getParticipantStatus(gameId: string, participantId: string): Promise<{ status: string } | null> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/participants/${participantId}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) return null;
      const participant = await response.json();
      return { status: participant.status };
    } catch (error) {
      console.error('[API] Failed to get participant status:', error);
      return null;
    }
  }

  // ========== CAPTURE APIs ==========

  // Get participant's capture info (for QR code display)
  async getParticipantCaptureInfo(gameId: string, participantId: string): Promise<{
    captureSecret: string;
    isCatchFreeActive: boolean;
  } | null> {
    try {
      const url = `${this.getBaseUrl()}/games/${gameId}/participants/${participantId}/capture-info`;
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to get capture info:', error);
      return null;
    }
  }

  // Capture by QR code (hunter scans player)
  async captureByQRCode(gameId: string, hunterId: string, playerId: string, captureSecret: string): Promise<{
    success: boolean;
    message?: string;
    capture?: {
      id: string;
      playerName: string;
      status: string;
    };
  }> {
    try {
      const url = `${this.getBaseUrl()}/captures/qr-capture`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ gameId, hunterId, playerId, captureSecret }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message };
      }
      const data = await response.json();
      return { 
        success: true, 
        capture: {
          id: data.id,
          playerName: data.playerInfo?.displayName || 'Unknown',
          status: data.status,
        }
      };
    } catch (error) {
      console.error('[API] Failed to capture by QR:', error);
      return { success: false, message: 'Network error' };
    }
  }

  // Confirm capture with handcuff photo
  async confirmCaptureWithHandcuff(captureId: string, photoUri: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      // First upload the photo
      const formData = new FormData();
      formData.append('file', {
        uri: photoUri,
        type: 'image/jpeg',
        name: 'handcuff.jpg',
      } as any);
      formData.append('captureId', captureId);

      const uploadUrl = `${this.getBaseUrl()}/uploads/handcuff-photo`;
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        return { success: false, message: 'Failed to upload photo' };
      }

      const uploadResult = await uploadResponse.json();

      // Then confirm the capture
      const confirmUrl = `${this.getBaseUrl()}/captures/${captureId}/confirm-handcuff`;
      const confirmResponse = await fetch(confirmUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ handcuffPhotoUrl: uploadResult.url }),
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json();
        return { success: false, message: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('[API] Failed to confirm capture with handcuff:', error);
      return { success: false, message: 'Network error' };
    }
  }

  /**
   * Create a periodic ping (REST fallback for 10s timer)
   * Called when WebSocket is not connected
   */
  async createPing(gameId: string, latitude: number, longitude: number, source: 'PERIODIC' | 'SPEEDHUNT' | 'SILENTHUNT' | 'MANUAL' = 'PERIODIC'): Promise<{
    success: boolean;
    pingId?: string;
    timestamp?: string;
    message?: string;
  }> {
    try {
      const url = `${this.getBaseUrl()}/tracking/games/${gameId}/ping`;
      console.log('[API] Creating ping:', url, { latitude, longitude, source });
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ latitude, longitude, source }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to create ping' };
      }
      return await response.json();
    } catch (error) {
      console.error('[API] Failed to create ping:', error);
      return { success: false, message: 'Network error' };
    }
  }
}

export const apiService = new ApiService();
