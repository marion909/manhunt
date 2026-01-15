import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatChannel } from '../common/enums/chat-channel.enum';
import { Role } from '../common/enums';
import { RulesService } from '../rules/rules.service';
import { RuleType } from '../rules/entities/game-rule.entity';

export interface VoiceSender {
  participantId: string;
  gameId: string;
  role: Role;
  displayName: string;
}

export interface VoiceParticipant {
  participantId: string;
  displayName: string;
  role: Role;
  muted: boolean;
  joinedAt: Date;
}

// In-memory store for voice room participants (could use Redis for scaling)
const voiceRooms: Map<string, Map<string, VoiceParticipant>> = new Map();

@Injectable()
export class VoiceService {
  constructor(
    private configService: ConfigService,
    private rulesService: RulesService,
  ) {}

  /**
   * Check if a sender can join a voice channel
   * Same permission rules as text chat
   */
  async canJoinVoiceChannel(sender: VoiceSender, channel: ChatChannel): Promise<boolean> {
    const { role, gameId } = sender;

    // ORGA and OPERATOR can always join
    if (role === Role.ORGA || role === Role.OPERATOR) {
      return true;
    }

    switch (channel) {
      case ChatChannel.GLOBAL:
        // Only ORGA/OPERATOR can join global voice
        return false;

      case ChatChannel.ORGA:
        // Everyone can join ORGA voice channel to communicate with organizers
        return true;

      case ChatChannel.HUNTERS:
        // Only Hunters
        return role === Role.HUNTER;

      case ChatChannel.PLAYERS:
        // Players only if PLAYER_VOICE_CHAT rule is enabled
        if (role !== Role.PLAYER) {
          return false;
        }
        return await this.isPlayerVoiceChatEnabled(gameId);

      default:
        return false;
    }
  }

  /**
   * Check if PLAYER_VOICE_CHAT rule is enabled for the game
   */
  async isPlayerVoiceChatEnabled(gameId: string): Promise<boolean> {
    try {
      const rule = await this.rulesService.findByGameAndType(gameId, RuleType.PLAYER_VOICE_CHAT);
      return rule?.isEnabled ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get ICE servers configuration for WebRTC
   */
  getIceServers(): RTCIceServer[] {
    const turnHost = this.configService.get('TURN_HOST', '192.168.0.100');
    const turnSecret = this.configService.get('TURN_SECRET', 'manhunt-turn-secret-change-in-production');

    // Generate temporary TURN credentials (valid for 1 hour)
    const timestamp = Math.floor(Date.now() / 1000) + 3600;
    const username = `${timestamp}:manhunt`;
    
    // In production, use proper HMAC for credential generation
    // For development, use static credentials
    const credential = turnSecret;

    return [
      {
        urls: ['stun:stun.l.google.com:19302'], // Public STUN as fallback
      },
      {
        urls: [`turn:${turnHost}:3478`],
        username,
        credential,
      },
      {
        urls: [`turn:${turnHost}:3478?transport=tcp`],
        username,
        credential,
      },
    ];
  }

  /**
   * Add participant to voice room
   */
  async joinVoiceRoom(gameId: string, channel: ChatChannel, sender: VoiceSender): Promise<void> {
    const roomKey = `${gameId}:${channel}`;
    
    if (!voiceRooms.has(roomKey)) {
      voiceRooms.set(roomKey, new Map());
    }

    const room = voiceRooms.get(roomKey)!;
    room.set(sender.participantId, {
      participantId: sender.participantId,
      displayName: sender.displayName,
      role: sender.role,
      muted: false,
      joinedAt: new Date(),
    });
  }

  /**
   * Remove participant from voice room
   */
  async leaveVoiceRoom(gameId: string, channel: ChatChannel, participantId: string): Promise<void> {
    const roomKey = `${gameId}:${channel}`;
    const room = voiceRooms.get(roomKey);
    
    if (room) {
      room.delete(participantId);
      
      // Clean up empty rooms
      if (room.size === 0) {
        voiceRooms.delete(roomKey);
      }
    }
  }

  /**
   * Get all participants in a voice room
   */
  async getVoiceRoomParticipants(gameId: string, channel: ChatChannel): Promise<VoiceParticipant[]> {
    const roomKey = `${gameId}:${channel}`;
    const room = voiceRooms.get(roomKey);
    
    if (!room) {
      return [];
    }

    return Array.from(room.values());
  }

  /**
   * Update participant mute status
   */
  async updateMuteStatus(gameId: string, channel: ChatChannel, participantId: string, muted: boolean): Promise<void> {
    const roomKey = `${gameId}:${channel}`;
    const room = voiceRooms.get(roomKey);
    
    if (room && room.has(participantId)) {
      const participant = room.get(participantId)!;
      participant.muted = muted;
    }
  }
}
