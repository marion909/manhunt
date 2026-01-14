import { create } from 'zustand';
import { Game, Participant, GameEvent, Position, Ping } from '../types';

interface GameStore {
  game: Game | null;
  participants: Participant[];
  events: GameEvent[];
  hunterPositions: Map<string, Position>;
  playerPings: Ping[];
  isConnected: boolean;

  setGame: (game: Game) => void;
  setParticipants: (participants: Participant[]) => void;
  addEvent: (event: GameEvent) => void;
  updateHunterPosition: (data: { userId: string; position: Position }) => void;
  updatePlayerPing: (ping: Ping) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  game: null,
  participants: [],
  events: [],
  hunterPositions: new Map(),
  playerPings: [],
  isConnected: false,

  setGame: (game) => set({ game }),

  setParticipants: (participants) => set({ participants }),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 100), // Keep last 100 events
    })),

  updateHunterPosition: (data) =>
    set((state) => {
      const newPositions = new Map(state.hunterPositions);
      newPositions.set(data.userId, data.position);
      return { hunterPositions: newPositions };
    }),

  updatePlayerPing: (ping) =>
    set((state) => ({
      playerPings: [ping, ...state.playerPings].slice(0, 50), // Keep last 50 pings
    })),

  setConnected: (connected) => set({ isConnected: connected }),

  reset: () =>
    set({
      game: null,
      participants: [],
      events: [],
      hunterPositions: new Map(),
      playerPings: [],
      isConnected: false,
    }),
}));
