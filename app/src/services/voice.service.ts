import io, { Socket } from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
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
  private remoteStreams: Map<string, MediaStream> = new Map();
  private iceServers: RTCIceServer[] = [];
  private pendingOffers: Map<string, boolean> = new Map(); // Track if we sent an offer

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

    this.socket.on('join:voice:success', async (data) => {
      console.log('[Voice] ✅ Joined voice channel successfully:', data);
      console.log('[Voice] ICE Servers:', data.iceServers?.length || 0);
      console.log('[Voice] Participants:', data.participants?.length || 0);
      this.iceServers = data.iceServers || [];
      useVoiceStore.getState().setInVoiceChannel(true);
      useVoiceStore.getState().setCurrentChannel(data.channel);
      useVoiceStore.getState().setParticipants(data.participants || []);
      useVoiceStore.getState().setError(null);

      // Start local audio stream after joining
      await this.startLocalAudioStream();

      // Connect to existing participants
      for (const participant of data.participants || []) {
        if (participant.participantId !== useAuthStore.getState().participantId) {
          await this.initiateConnection(participant.participantId);
        }
      }
    });

    this.socket.on('voice:participant:joined', async (data: VoiceParticipant) => {
      console.log('[Voice] Participant joined:', data.displayName);
      useVoiceStore.getState().addParticipant(data);
      
      // Initiate WebRTC connection with the new participant
      if (this.localStream) {
        await this.initiateConnection(data.participantId);
      }
    });

    this.socket.on('voice:participant:left', (data: { participantId: string }) => {
      console.log('[Voice] Participant left:', data.participantId);
      useVoiceStore.getState().removeParticipant(data.participantId);
      this.closePeerConnection(data.participantId);
    });

    this.socket.on('voice:offer', async (data) => {
      const myParticipantId = useAuthStore.getState().participantId;
      
      // Only process offers meant for me
      if (data.targetParticipantId && data.targetParticipantId !== myParticipantId) {
        return;
      }
      
      // Ignore offers from myself
      if (data.fromParticipantId === myParticipantId) {
        return;
      }
      
      console.log('[Voice] Received offer from:', data.fromParticipantId);
      
      // Polite peer logic: If we also sent an offer, the peer with smaller ID wins (is "impolite")
      // The "polite" peer rolls back and accepts the incoming offer
      const existingPc = this.peerConnections.get(data.fromParticipantId);
      const weArePolite = myParticipantId! > data.fromParticipantId; // Smaller ID is impolite
      
      if (existingPc && this.pendingOffers.get(data.fromParticipantId)) {
        if (weArePolite) {
          // We are polite: roll back our offer and accept theirs
          console.log('[Voice] Glare detected, we are polite - rolling back');
          this.closePeerConnection(data.fromParticipantId);
        } else {
          // We are impolite: ignore their offer, they should accept ours
          console.log('[Voice] Glare detected, we are impolite - ignoring their offer');
          return;
        }
      }
      
      try {
        const pc = this.createPeerConnection(data.fromParticipantId);
        
        // Add local tracks if available
        if (this.localStream) {
          const senders = pc.getSenders ? pc.getSenders() : [];
          if (senders.length === 0) {
            this.localStream.getTracks().forEach(track => {
              pc.addTrack(track, this.localStream!);
            });
          }
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        const currentChannel = useVoiceStore.getState().currentChannel;
        this.socket?.emit('voice:answer', {
          targetParticipantId: data.fromParticipantId,
          answer: pc.localDescription,
          channel: currentChannel,
        });
      } catch (err) {
        console.error('[Voice] Error handling offer:', err);
      }
    });

    this.socket.on('voice:answer', async (data) => {
      const myParticipantId = useAuthStore.getState().participantId;
      
      // Only process answers meant for me
      if (data.targetParticipantId && data.targetParticipantId !== myParticipantId) {
        return;
      }
      
      console.log('[Voice] Received answer from:', data.fromParticipantId);
      try {
        const pc = this.peerConnections.get(data.fromParticipantId);
        if (pc) {
          // Only set remote description if we're waiting for an answer
          const signalingState = pc.signalingState;
          if (signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            this.pendingOffers.delete(data.fromParticipantId);
            console.log('[Voice] ✅ Answer applied successfully');
          } else {
            console.log('[Voice] Ignoring answer, signaling state is:', signalingState);
          }
        }
      } catch (err) {
        console.error('[Voice] Error handling answer:', err);
      }
    });

    this.socket.on('voice:ice-candidate', async (data) => {
      const myParticipantId = useAuthStore.getState().participantId;
      
      // Only process ICE candidates meant for me
      if (data.targetParticipantId && data.targetParticipantId !== myParticipantId) {
        return;
      }
      
      try {
        const pc = this.peerConnections.get(data.fromParticipantId);
        if (pc && data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error('[Voice] Error adding ICE candidate:', err);
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

  private async startLocalAudioStream(): Promise<void> {
    try {
      console.log('[Voice] Starting local audio stream...');
      
      // Request microphone access - react-native-webrtc uses simpler constraints
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.localStream = stream as MediaStream;
      console.log('[Voice] ✅ Local audio stream started with', stream.getAudioTracks().length, 'tracks');

      // Add tracks to existing peer connections
      this.peerConnections.forEach((pc, participantId) => {
        console.log('[Voice] Adding local tracks to peer:', participantId);
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream as MediaStream);
        });
      });
    } catch (err) {
      console.error('[Voice] ❌ Error getting local audio stream:', err);
      useVoiceStore.getState().setError('Microphone could not be activated');
    }
  }

  private async initiateConnection(participantId: string): Promise<void> {
    console.log('[Voice] Initiating connection to:', participantId);
    try {
      // Check if we already have a connection in progress
      const existingPc = this.peerConnections.get(participantId);
      if (existingPc && existingPc.signalingState !== 'closed') {
        console.log('[Voice] Connection already exists for:', participantId, 'state:', existingPc.signalingState);
        return;
      }
      
      const pc = this.createPeerConnection(participantId);
      
      // Add local tracks if available
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream!);
        });
      }

      // Mark that we're sending an offer
      this.pendingOffers.set(participantId, true);

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      const currentChannel = useVoiceStore.getState().currentChannel;
      this.socket?.emit('voice:offer', {
        targetParticipantId: participantId,
        offer: pc.localDescription,
        channel: currentChannel,
      });
      console.log('[Voice] Offer sent to:', participantId);
    } catch (err) {
      console.error('[Voice] Error initiating connection:', err);
      this.pendingOffers.delete(participantId);
    }
  }

  private createPeerConnection(participantId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(participantId);
    if (existing) return existing;

    console.log('[Voice] Creating peer connection for:', participantId);
    
    const configuration = { 
      iceServers: this.iceServers.length > 0 ? this.iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    const pc = new RTCPeerConnection(configuration);

    // Use addEventListener for react-native-webrtc
    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate && this.socket) {
        const currentChannel = useVoiceStore.getState().currentChannel;
        this.socket.emit('voice:ice-candidate', {
          targetParticipantId: participantId,
          candidate: event.candidate,
          channel: currentChannel,
        });
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`[Voice] ICE state for ${participantId}:`, pc.iceConnectionState);
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log(`[Voice] Connection state for ${participantId}:`, (pc as any).connectionState);
    });

    pc.addEventListener('track', (event: any) => {
      console.log('[Voice] ✅ Received remote track from:', participantId);
      if (event.streams && event.streams[0]) {
        this.remoteStreams.set(participantId, event.streams[0]);
        // The audio will automatically play through the device speaker
        console.log('[Voice] Remote audio stream active');
      }
    });

    this.peerConnections.set(participantId, pc);
    return pc;
  }

  private closePeerConnection(participantId: string): void {
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(participantId);
    }
    this.remoteStreams.delete(participantId);
    this.pendingOffers.delete(participantId);
  }

  async joinVoiceChannel(channel: ChatChannel): Promise<void> {
    if (!this.socket?.connected) {
      console.warn('[Voice] Cannot join - not connected');
      return;
    }

    console.log('[Voice] Joining channel:', channel);

    const { gameId, participantId } = useAuthStore.getState();
    this.socket.emit('join:voice', { gameId, channel, participantId });
  }

  leaveVoiceChannel(): void {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();

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
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !newMuted;
      });
      console.log('[Voice] Mute toggled:', newMuted);
    }

    useVoiceStore.getState().setMuted(newMuted);
    this.socket?.emit('voice:mute', { channel: currentChannel, muted: newMuted });
  }

  disconnect(): void {
    this.leaveVoiceChannel();
    this.pendingOffers.clear();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const voiceService = new VoiceService();
