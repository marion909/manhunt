// Voice types for mobile app

import { ChatChannel } from './chat';

export interface VoiceParticipant {
  participantId: string;
  displayName: string;
  role: string;
  muted: boolean;
  speaking?: boolean;
  joinedAt?: string;
}

export interface VoiceState {
  isConnected: boolean;
  isInVoiceChannel: boolean;
  currentChannel: ChatChannel | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isSpeaking: boolean;
  error: string | null;
}
