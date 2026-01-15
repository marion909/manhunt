import { create } from 'zustand';
import { ChatMessage, ChatChannel, TypingUser } from '../types/chat';

interface ChatStore {
  isConnected: boolean;
  messages: ChatMessage[];
  typingUsers: Map<string, TypingUser>;
  
  setConnected: (connected: boolean) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  addTypingUser: (participantId: string, displayName: string, channel: ChatChannel) => void;
  removeTypingUser: (participantId: string) => void;
  getMessagesForChannel: (channel: ChatChannel) => ChatMessage[];
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  isConnected: false,
  messages: [],
  typingUsers: new Map(),

  setConnected: (connected) => set({ isConnected: connected }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  addTypingUser: (participantId, displayName, channel) => set((state) => {
    const newTyping = new Map(state.typingUsers);
    newTyping.set(participantId, { participantId, displayName, channel });
    return { typingUsers: newTyping };
  }),

  removeTypingUser: (participantId) => set((state) => {
    const newTyping = new Map(state.typingUsers);
    newTyping.delete(participantId);
    return { typingUsers: newTyping };
  }),

  getMessagesForChannel: (channel) => {
    return get().messages.filter((m) => m.channel === channel);
  },

  clearMessages: () => set({ messages: [], typingUsers: new Map() }),
}));
