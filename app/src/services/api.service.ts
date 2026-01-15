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
}

export const apiService = new ApiService();
