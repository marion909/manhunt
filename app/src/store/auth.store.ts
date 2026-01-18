import { create } from 'zustand';
import { AuthState, Role, ParticipantStatus } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthStore extends AuthState {
  setAuth: (data: Omit<AuthState, 'isAuthenticated'>) => Promise<void>;
  setGameId: (gameId: string) => Promise<void>;
  setParticipantStatus: (status: ParticipantStatus) => void;
  logout: () => Promise<void>;
  loadAuth: () => Promise<void>;
}

const AUTH_STORAGE_KEY = '@manhunt:auth';

export const useAuthStore = create<AuthStore>((set) => ({
  hostname: '',
  participantId: '',
  name: '',
  role: 'PLAYER',
  gameId: undefined,
  token: undefined,
  isAuthenticated: false,
  participantStatus: 'ACTIVE',

  setParticipantStatus: (status) => set({ participantStatus: status }),

  setAuth: async (data) => {
    const authState: AuthState = {
      ...data,
      isAuthenticated: true,
    };
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    set(authState);
  },

  setGameId: async (gameId) => {
    const currentState = useAuthStore.getState();
    const newState = { ...currentState, gameId };
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newState));
    set({ gameId });
  },

  logout: async () => {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    set({
      hostname: '',
      participantId: '',
      name: '',
      role: 'PLAYER',
      gameId: undefined,
      token: undefined,
      isAuthenticated: false,
      participantStatus: 'ACTIVE',
    });
  },

  loadAuth: async () => {
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const authState = JSON.parse(stored) as AuthState;
        set(authState);
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    }
  },
}));
