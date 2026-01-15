import { create } from 'zustand';
import { ChatChannel } from '../types/chat';
import { VoiceParticipant } from '../types/voice';

interface VoiceStore {
  isConnected: boolean;
  isInVoiceChannel: boolean;
  currentChannel: ChatChannel | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isSpeaking: boolean;
  error: string | null;

  setConnected: (connected: boolean) => void;
  setInVoiceChannel: (inChannel: boolean) => void;
  setCurrentChannel: (channel: ChatChannel | null) => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
  addParticipant: (participant: VoiceParticipant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipantMute: (participantId: string, muted: boolean) => void;
  updateParticipantSpeaking: (participantId: string, speaking: boolean) => void;
  setMuted: (muted: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  isConnected: false,
  isInVoiceChannel: false,
  currentChannel: null,
  participants: [],
  isMuted: false,
  isSpeaking: false,
  error: null,

  setConnected: (connected) => set({ isConnected: connected }),

  setInVoiceChannel: (inChannel) => set({ isInVoiceChannel: inChannel }),

  setCurrentChannel: (channel) => set({ currentChannel: channel }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) => set((state) => ({
    participants: [
      ...state.participants.filter(p => p.participantId !== participant.participantId),
      participant,
    ],
  })),

  removeParticipant: (participantId) => set((state) => ({
    participants: state.participants.filter(p => p.participantId !== participantId),
  })),

  updateParticipantMute: (participantId, muted) => set((state) => ({
    participants: state.participants.map(p =>
      p.participantId === participantId ? { ...p, muted } : p
    ),
  })),

  updateParticipantSpeaking: (participantId, speaking) => set((state) => ({
    participants: state.participants.map(p =>
      p.participantId === participantId ? { ...p, speaking } : p
    ),
  })),

  setMuted: (muted) => set({ isMuted: muted }),

  setSpeaking: (speaking) => set({ isSpeaking: speaking }),

  setError: (error) => set({ error }),

  reset: () => set({
    isInVoiceChannel: false,
    currentChannel: null,
    participants: [],
    isMuted: false,
    isSpeaking: false,
    error: null,
  }),
}));
