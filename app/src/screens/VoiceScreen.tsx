import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { useVoiceStore } from '../store/voice.store';
import { voiceService } from '../services/voice.service';
import { apiService } from '../services/api.service';
import { ChatChannel } from '../types/chat';
import { VoiceParticipant } from '../types/voice';

const CHANNEL_CONFIG: Record<ChatChannel, { label: string; color: string }> = {
  [ChatChannel.GLOBAL]: { label: 'Global Voice', color: '#3B82F6' },
  [ChatChannel.HUNTERS]: { label: 'Hunters Voice', color: '#EF4444' },
  [ChatChannel.PLAYERS]: { label: 'Players Voice', color: '#22C55E' },
  [ChatChannel.ORGA]: { label: 'ORGA Voice', color: '#A855F7' },
  [ChatChannel.DIRECT]: { label: 'Direct', color: '#6B7280' },
};

export default function VoiceScreen() {
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel>(ChatChannel.ORGA);
  const [isPlayerVoiceEnabled, setIsPlayerVoiceEnabled] = useState(false);
  
  const role = useAuthStore((state) => state.role);
  const hostname = useAuthStore((state) => state.hostname);
  const gameId = useAuthStore((state) => state.gameId);
  
  const isConnected = useVoiceStore((state) => state.isConnected);
  const isInVoiceChannel = useVoiceStore((state) => state.isInVoiceChannel);
  const currentChannel = useVoiceStore((state) => state.currentChannel);
  const participants = useVoiceStore((state) => state.participants);
  const isMuted = useVoiceStore((state) => state.isMuted);
  const error = useVoiceStore((state) => state.error);

  // Check game rules for PLAYER_VOICE_CHAT
  const loadGameRules = useCallback(async () => {
    if (!gameId) return;
    
    const playerVoiceEnabled = await apiService.isRuleEnabled(gameId, 'PLAYER_VOICE_CHAT');
    setIsPlayerVoiceEnabled(playerVoiceEnabled);
  }, [gameId]);

  // Initial load and poll every 10 seconds
  useEffect(() => {
    loadGameRules();
    const interval = setInterval(loadGameRules, 10000);
    return () => clearInterval(interval);
  }, [loadGameRules]);

  // Get available channels based on role and game rules
  const availableChannels = (() => {
    switch (role?.toUpperCase()) {
      case 'ORGA':
      case 'OPERATOR':
        return [ChatChannel.GLOBAL, ChatChannel.HUNTERS, ChatChannel.PLAYERS, ChatChannel.ORGA];
      case 'HUNTER':
        return [ChatChannel.HUNTERS, ChatChannel.ORGA];
      case 'PLAYER':
        // Players can use PLAYERS channel if PLAYER_VOICE_CHAT rule is enabled
        if (isPlayerVoiceEnabled) {
          return [ChatChannel.PLAYERS, ChatChannel.ORGA];
        }
        return [ChatChannel.ORGA];
      default:
        return [ChatChannel.ORGA];
    }
  })();

  useEffect(() => {
    if (hostname) {
      voiceService.connect(hostname);
    }

    return () => {
      // Don't disconnect on unmount
    };
  }, [hostname]);

  const handleJoinChannel = () => {
    if (!isConnected) {
      Alert.alert('Error', 'Not connected to voice server');
      return;
    }
    voiceService.joinVoiceChannel(selectedChannel);
  };

  const handleLeaveChannel = () => {
    voiceService.leaveVoiceChannel();
  };

  const handleToggleMute = () => {
    voiceService.toggleMute();
  };

  const renderParticipant = ({ item }: { item: VoiceParticipant }) => (
    <View style={[styles.participantItem, item.speaking && styles.participantSpeaking]}>
      <View style={[styles.speakingIndicator, item.speaking && styles.speakingActive]} />
      <Text style={styles.participantName}>{item.displayName}</Text>
      <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
        <Text style={styles.roleBadgeText}>{item.role}</Text>
      </View>
      <Text style={[styles.muteStatus, item.muted && styles.muted]}>
        {item.muted ? '🔇' : '🔊'}
      </Text>
    </View>
  );

  const getRoleColor = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'ORGA':
      case 'OPERATOR':
        return '#A855F7';
      case 'HUNTER':
        return '#EF4444';
      case 'PLAYER':
        return '#22C55E';
      default:
        return '#6B7280';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Chat</Text>
        <View style={[styles.connectionBadge, isConnected ? styles.connected : styles.disconnected]}>
          <Text style={styles.connectionText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isInVoiceChannel ? (
        // Channel selection
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Select Voice Channel</Text>
          
          <View style={styles.channelList}>
            {availableChannels.map((channel) => (
              <TouchableOpacity
                key={channel}
                style={[
                  styles.channelItem,
                  selectedChannel === channel && { borderColor: CHANNEL_CONFIG[channel].color },
                ]}
                onPress={() => setSelectedChannel(channel)}
              >
                <View style={[styles.channelIcon, { backgroundColor: CHANNEL_CONFIG[channel].color }]} />
                <Text style={styles.channelName}>{CHANNEL_CONFIG[channel].label}</Text>
                {selectedChannel === channel && (
                  <Text style={styles.selectedIndicator}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.joinButton, !isConnected && styles.buttonDisabled]}
            onPress={handleJoinChannel}
            disabled={!isConnected}
          >
            <Text style={styles.joinButtonText}>📞 Join Voice Channel</Text>
          </TouchableOpacity>

          <Text style={styles.infoText}>
            Note: Voice chat requires microphone permission.
          </Text>
        </View>
      ) : (
        // In voice channel
        <View style={styles.content}>
          {/* Current channel info */}
          <View style={styles.currentChannelCard}>
            <View style={[styles.channelIcon, { backgroundColor: CHANNEL_CONFIG[currentChannel!]?.color || '#6B7280' }]} />
            <Text style={styles.currentChannelName}>
              {CHANNEL_CONFIG[currentChannel!]?.label || currentChannel}
            </Text>
            <Text style={styles.participantCount}>{participants.length} participants</Text>
          </View>

          {/* Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.muteButton]}
              onPress={handleToggleMute}
            >
              <Text style={styles.controlButtonText}>
                {isMuted ? '🔇 Unmute' : '🎤 Mute'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.controlButton, styles.leaveButton]}
              onPress={handleLeaveChannel}
            >
              <Text style={styles.controlButtonText}>📵 Leave</Text>
            </TouchableOpacity>
          </View>

          {/* Participants */}
          <Text style={styles.sectionTitle}>Participants</Text>
          {participants.length > 0 ? (
            <FlatList
              data={participants}
              renderItem={renderParticipant}
              keyExtractor={(item) => item.participantId}
              style={styles.participantsList}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No other participants yet</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#1F2937',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  connectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  connected: {
    backgroundColor: '#22C55E',
  },
  disconnected: {
    backgroundColor: '#EF4444',
  },
  connectionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#7F1D1D',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  channelList: {
    marginBottom: 24,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  channelIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  channelName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  selectedIndicator: {
    color: '#22C55E',
    fontSize: 18,
    fontWeight: 'bold',
  },
  joinButton: {
    backgroundColor: '#22C55E',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#374151',
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
  currentChannelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  currentChannelName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  participantCount: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  controlsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  controlButton: {
    flex: 1,
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  muteButton: {
    backgroundColor: '#B91C1C',
  },
  leaveButton: {
    backgroundColor: '#EF4444',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  participantsList: {
    flex: 1,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  participantSpeaking: {
    backgroundColor: '#14532D',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  speakingIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6B7280',
    marginRight: 12,
  },
  speakingActive: {
    backgroundColor: '#22C55E',
  },
  participantName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  muteStatus: {
    fontSize: 16,
  },
  muted: {
    opacity: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
