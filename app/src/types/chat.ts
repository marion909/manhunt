// Chat types for mobile app

export enum ChatChannel {
  GLOBAL = 'GLOBAL',
  HUNTERS = 'HUNTERS',
  PLAYERS = 'PLAYERS',
  ORGA = 'ORGA',
  DIRECT = 'DIRECT',
}

export enum MessageType {
  TEXT = 'TEXT',
  SYSTEM = 'SYSTEM',
  VOICE_STARTED = 'VOICE_STARTED',
  VOICE_ENDED = 'VOICE_ENDED',
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  content: string;
  messageType: MessageType;
  senderId?: string;
  senderDisplayName?: string;
  senderRole?: string;
  recipientId?: string;
  recipientDisplayName?: string;
  createdAt: string;
}

export interface TypingUser {
  participantId: string;
  displayName: string;
  channel: ChatChannel;
}
