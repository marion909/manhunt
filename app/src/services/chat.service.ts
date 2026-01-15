import io, { Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { useChatStore } from '../store/chat.store';
import { ChatMessage, ChatChannel, MessageType } from '../types/chat';

class ChatService {
  private socket: Socket | null = null;

  connect(hostname: string): void {
    if (this.socket?.connected) {
      console.log('[Chat] Already connected');
      return;
    }

    const { participantId } = useAuthStore.getState();
    console.log(`[Chat] Connecting to ws://${hostname}:3000/chat`);

    this.socket = io(`ws://${hostname}:3000/chat`, {
      auth: {
        participantId: participantId,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Chat] WebSocket connected');
      useChatStore.getState().setConnected(true);

      const { gameId, participantId } = useAuthStore.getState();
      if (gameId) {
        this.joinChat(gameId, participantId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Chat] WebSocket disconnected:', reason);
      useChatStore.getState().setConnected(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Chat] Connection error:', error);
    });

    this.socket.on('join:chat:success', (data) => {
      console.log('[Chat] Joined chat:', data);
    });

    this.socket.on('chat:history', (messages: ChatMessage[]) => {
      console.log('[Chat] Received history:', messages.length, 'messages');
      useChatStore.getState().setMessages(messages);
    });

    this.socket.on('message:new', (message: ChatMessage) => {
      console.log('[Chat] New message:', message.content?.substring(0, 30));
      useChatStore.getState().addMessage(message);
    });

    this.socket.on('message:direct', (data: ChatMessage & { forParticipant: string; fromParticipant?: string; isOrgaMonitoring?: boolean }) => {
      const { participantId, role } = useAuthStore.getState();
      const isOrga = role?.toUpperCase() === 'ORGA' || role?.toUpperCase() === 'OPERATOR';
      
      // ORGA sees all direct messages
      if (isOrga && data.isOrgaMonitoring) {
        useChatStore.getState().addMessage(data);
        return;
      }
      
      // Players only see messages for them or from them
      if (data.forParticipant === participantId || data.fromParticipant === participantId || data.senderId === participantId) {
        useChatStore.getState().addMessage(data);
      }
    });

    this.socket.on('typing:start', (data: { participantId: string; displayName: string; channel: ChatChannel }) => {
      useChatStore.getState().addTypingUser(data.participantId, data.displayName, data.channel);
    });

    this.socket.on('typing:stop', (data: { participantId: string; channel: ChatChannel }) => {
      useChatStore.getState().removeTypingUser(data.participantId);
    });

    this.socket.on('error', (error: { message: string }) => {
      console.error('[Chat] Error:', error);
    });
  }

  joinChat(gameId: string, participantId: string): void {
    console.log('[Chat] Joining chat:', gameId);
    this.socket?.emit('join:chat', { gameId, participantId });
  }

  sendMessage(channel: ChatChannel, content: string, recipientId?: string): void {
    if (!this.socket?.connected) {
      console.warn('[Chat] Cannot send - not connected');
      return;
    }

    this.socket.emit('message:send', {
      channel,
      content,
      recipientId,
      messageType: MessageType.TEXT,
    });
  }

  startTyping(channel: ChatChannel): void {
    this.socket?.emit('typing:start', { channel });
  }

  stopTyping(channel: ChatChannel): void {
    this.socket?.emit('typing:stop', { channel });
  }

  loadMessages(channel?: ChatChannel, beforeId?: string, limit: number = 50): void {
    this.socket?.emit('messages:get', { channel, before: beforeId, limit });
  }

  leaveChat(): void {
    this.socket?.emit('leave:chat');
  }

  disconnect(): void {
    this.leaveChat();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const chatService = new ChatService();
