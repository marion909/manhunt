import io, { Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { useVoiceStore } from '../store/voice.store';
import { ChatChannel } from '../types/chat';
import { VoiceParticipant } from '../types/voice';

// RTCPeerConnection config
interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

class VoiceService {
  private socket: Socket | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [];

  connect(hostname: string): void {
    if (this.socket?.connected) {
      console.log('[Voice] Already connected');
      return;
    }

    const { participantId } = useAuthStore.getState();
    console.log(`[Voice] Connecting to ws://${hostname}:3000/voice`);

    this.socket = io(`ws://${hostname}:3000/voice`, {
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
      console.log('[Voice] WebSocket connected');
      useVoiceStore.getState().setConnected(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Voice] WebSocket disconnected:', reason);
      useVoiceStore.getState().setConnected(false);
      useVoiceStore.getState().setInVoiceChannel(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Voice] Connection error:', error);
    });

    this.socket.on('join:voice:success', (data) => {
      console.log('[Voice] ✅ Joined voice channel successfully:', data);
      console.log('[Voice] ICE Servers:', data.iceServers?.length || 0);
      console.log('[Voice] Participants:', data.participants?.length || 0);
      this.iceServers = data.iceServers || [];
      useVoiceStore.getState().setInVoiceChannel(true);
      useVoiceStore.getState().setCurrentChannel(data.channel);
      useVoiceStore.getState().setParticipants(data.participants || []);
      useVoiceStore.getState().setError(null);
    });

    this.socket.on('voice:participant:joined', (data: VoiceParticipant) => {
      console.log('[Voice] Participant joined:', data.displayName);
      useVoiceStore.getState().addParticipant(data);
      
      // Initiate WebRTC connection if we have local stream
      if (this.localStream) {
        this.createPeerConnection(data.participantId);
      }
    });

    this.socket.on('voice:participant:left', (data: { participantId: string }) => {
      console.log('[Voice] Participant left:', data.participantId);
      useVoiceStore.getState().removeParticipant(data.participantId);
      this.closePeerConnection(data.participantId);
    });

    this.socket.on('voice:offer', async (data) => {
      console.log('[Voice] Received offer from:', data.fromParticipantId);
      const pc = this.createPeerConnection(data.fromParticipantId);
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      const currentChannel = useVoiceStore.getState().currentChannel;
      this.socket?.emit('voice:answer', {
        targetParticipantId: data.fromParticipantId,
        answer,
        channel: currentChannel,
      });
    });

    this.socket.on('voice:answer', async (data) => {
      console.log('[Voice] Received answer from:', data.fromParticipantId);
      const pc = this.peerConnections.get(data.fromParticipantId);
      if (pc) {
        await pc.setRemoteDescription(data.answer);
      }
    });

    this.socket.on('voice:ice-candidate', async (data) => {
      const pc = this.peerConnections.get(data.fromParticipantId);
      if (pc && data.candidate) {
        await pc.addIceCandidate(data.candidate);
      }
    });

    this.socket.on('voice:mute', (data: { participantId: string; muted: boolean }) => {
      useVoiceStore.getState().updateParticipantMute(data.participantId, data.muted);
    });

    this.socket.on('voice:speaking', (data: { participantId: string; speaking: boolean }) => {
      useVoiceStore.getState().updateParticipantSpeaking(data.participantId, data.speaking);
    });

    this.socket.on('error', (error: { message: string }) => {
      console.error('[Voice] Error:', error);
      useVoiceStore.getState().setError(error.message);
    });
  }

  private createPeerConnection(participantId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(participantId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        const currentChannel = useVoiceStore.getState().currentChannel;
        this.socket.emit('voice:ice-candidate', {
          targetParticipantId: participantId,
          candidate: event.candidate,
          channel: currentChannel,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[Voice] Received remote track from:', participantId);
      // In React Native, you'd use react-native-webrtc's RTCView
      // For now, just log it
    };

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    this.peerConnections.set(participantId, pc);
    return pc;
  }

  private closePeerConnection(participantId: string): void {
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(participantId);
    }
  }

  async joinVoiceChannel(channel: ChatChannel): Promise<void> {
    if (!this.socket?.connected) {
      console.warn('[Voice] Cannot join - not connected');
      return;
    }

    // In a real implementation, you'd use react-native-webrtc or expo-av
    // to get the audio stream
    console.log('[Voice] Joining channel:', channel);

    const { gameId, participantId } = useAuthStore.getState();
    this.socket.emit('join:voice', { gameId, channel, participantId });
  }

  leaveVoiceChannel(): void {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();

    // Notify server
    this.socket?.emit('leave:voice');
    
    useVoiceStore.getState().setInVoiceChannel(false);
    useVoiceStore.getState().setCurrentChannel(null);
    useVoiceStore.getState().setParticipants([]);
  }

  toggleMute(): void {
    const { isMuted, currentChannel } = useVoiceStore.getState();
    const newMuted = !isMuted;
    
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !newMuted;
      }
    }

    useVoiceStore.getState().setMuted(newMuted);
    this.socket?.emit('voice:mute', { channel: currentChannel, muted: newMuted });
  }

  disconnect(): void {
    this.leaveVoiceChannel();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const voiceService = new VoiceService();
