import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { useChatStore } from '../store/chat.store';
import { chatService } from '../services/chat.service';
import { apiService, Participant } from '../services/api.service';
import { ChatChannel, ChatMessage, MessageType } from '../types/chat';

const CHANNEL_CONFIG: Record<ChatChannel, { label: string; color: string }> = {
  [ChatChannel.GLOBAL]: { label: 'Global', color: '#3B82F6' },
  [ChatChannel.HUNTERS]: { label: 'Hunters', color: '#EF4444' },
  [ChatChannel.PLAYERS]: { label: 'Players', color: '#22C55E' },
  [ChatChannel.ORGA]: { label: 'ORGA', color: '#A855F7' },
  [ChatChannel.DIRECT]: { label: 'Direct', color: '#6B7280' },
};

export default function ChatScreen() {
  const [activeChannel, setActiveChannel] = useState<ChatChannel>(ChatChannel.ORGA);
  const [messageInput, setMessageInput] = useState('');
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [players, setPlayers] = useState<Participant[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Participant | null>(null);
  const [isPlayerChatEnabled, setIsPlayerChatEnabled] = useState(false);
  const [maxMessages, setMaxMessages] = useState<number | null>(null);
  const [sentMessageCount, setSentMessageCount] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  
  const role = useAuthStore((state) => state.role);
  const hostname = useAuthStore((state) => state.hostname);
  const gameId = useAuthStore((state) => state.gameId);
  const participantId = useAuthStore((state) => state.participantId);
  
  const isConnected = useChatStore((state) => state.isConnected);
  const getMessagesForChannel = useChatStore((state) => state.getMessagesForChannel);

  const isOrga = role?.toUpperCase() === 'ORGA' || role?.toUpperCase() === 'OPERATOR';

  // Get messages - for DIRECT channel:
  // - ORGA sees ALL direct messages (monitoring)
  // - Players see only their own conversations with selected recipient
  const channelMessages = (() => {
    if (activeChannel === ChatChannel.DIRECT) {
      const allDirectMessages = getMessagesForChannel(ChatChannel.DIRECT);
      
      // ORGA sees all direct messages
      if (isOrga) {
        return allDirectMessages;
      }
      
      // Players see only messages with selected recipient
      if (selectedRecipient) {
        return allDirectMessages.filter(
          (m) => m.recipientId === selectedRecipient.id || m.senderId === selectedRecipient.id
        );
      }
      
      return [];
    }
    return getMessagesForChannel(activeChannel);
  })();

  // Count sent direct messages by this player
  const countSentDirectMessages = useCallback(() => {
    const directMessages = getMessagesForChannel(ChatChannel.DIRECT);
    return directMessages.filter((m) => m.senderId === participantId).length;
  }, [getMessagesForChannel, participantId]);

  // Check game rules and load players
  const loadGameData = useCallback(async () => {
    if (!gameId) {
      console.log('[Chat] No gameId available, skipping rule/player fetch');
      return;
    }
    
    console.log('[Chat] Loading game data for gameId:', gameId);
    
    // Check if PLAYER_TEXT_CHAT is enabled and get config
    const rule = await apiService.getRuleConfig(gameId, 'PLAYER_TEXT_CHAT');
    setIsPlayerChatEnabled(!!rule);
    setMaxMessages(rule?.config?.maxMessages ?? null);
    
    // Update sent message count
    setSentMessageCount(countSentDirectMessages());
    
    // Load players for the player list
    const playerList = await apiService.getPlayers(gameId);
    // Filter out self
    setPlayers(playerList.filter((p) => p.id !== participantId));
  }, [gameId, participantId, countSentDirectMessages]);

  // Initial load
  useEffect(() => {
    loadGameData();
  }, [loadGameData]);

  // Poll for rule changes every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadGameData();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadGameData]);

  // Get available channels based on role and game rules
  const availableChannels = (() => {
    switch (role?.toUpperCase()) {
      case 'ORGA':
      case 'OPERATOR':
        // ORGA can see all channels including DIRECT to monitor player conversations
        return [ChatChannel.GLOBAL, ChatChannel.HUNTERS, ChatChannel.PLAYERS, ChatChannel.ORGA, ChatChannel.DIRECT];
      case 'HUNTER':
        return [ChatChannel.HUNTERS, ChatChannel.ORGA];
      case 'PLAYER':
        // Players can only send DIRECT messages to other players (no broadcast)
        if (isPlayerChatEnabled) {
          return [ChatChannel.ORGA, ChatChannel.DIRECT];
        }
        return [ChatChannel.ORGA];
      default:
        return [ChatChannel.ORGA];
    }
  })();

  useEffect(() => {
    // Connect to chat service
    if (hostname) {
      chatService.connect(hostname);
    }

    return () => {
      // Don't disconnect on unmount to keep receiving messages
    };
  }, [hostname]);

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    
    // For DIRECT channel, check message limit for players
    if (activeChannel === ChatChannel.DIRECT) {
      if (role?.toUpperCase() === 'PLAYER' && maxMessages !== null) {
        if (sentMessageCount >= maxMessages) {
          // Message limit reached
          return;
        }
      }
      
      if (selectedRecipient) {
        chatService.sendMessage(activeChannel, messageInput.trim(), selectedRecipient.id);
        // Update sent message count
        setSentMessageCount((prev) => prev + 1);
      }
    } else {
      chatService.sendMessage(activeChannel, messageInput.trim());
    }
    setMessageInput('');
  };

  // Check if player can send more direct messages
  const canSendDirectMessage = () => {
    if (role?.toUpperCase() !== 'PLAYER') return true;
    if (maxMessages === null) return true;
    return sentMessageCount < maxMessages;
  };

  const remainingMessages = maxMessages !== null ? maxMessages - sentMessageCount : null;

  const handleChannelChange = (channel: ChatChannel) => {
    setActiveChannel(channel);
    // If switching to DIRECT, show player picker
    if (channel === ChatChannel.DIRECT && !selectedRecipient) {
      setShowPlayerPicker(true);
    }
  };

  const handleSelectRecipient = (player: Participant) => {
    setSelectedRecipient(player);
    setShowPlayerPicker(false);
    setActiveChannel(ChatChannel.DIRECT);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item: message }: { item: ChatMessage }) => {
    const isSystem = message.messageType === MessageType.SYSTEM;

    if (isSystem) {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{message.content}</Text>
        </View>
      );
    }

    // For DIRECT messages when viewed by ORGA, show sender → recipient
    const showRecipientInfo = activeChannel === ChatChannel.DIRECT && isOrga && message.recipientId;

    return (
      <View style={styles.messageContainer}>
        <View style={styles.messageHeader}>
          <Text style={styles.senderName}>{message.senderDisplayName || 'Unknown'}</Text>
          {showRecipientInfo && (
            <Text style={styles.recipientArrowText}> → {message.recipientDisplayName || 'Spieler'}</Text>
          )}
          {message.senderRole && (
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(message.senderRole) }]}>
              <Text style={styles.roleBadgeText}>{message.senderRole}</Text>
            </View>
          )}
          <Text style={styles.messageTime}>{formatTime(message.createdAt)}</Text>
        </View>
        <Text style={styles.messageContent}>{message.content}</Text>
      </View>
    );
  };

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Player Picker Modal */}
      <Modal
        visible={showPlayerPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlayerPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nachricht an Spieler</Text>
              <TouchableOpacity onPress={() => setShowPlayerPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.playerList}>
              {players.length === 0 ? (
                <Text style={styles.noPlayersText}>Keine anderen Spieler im Spiel</Text>
              ) : (
                players.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    style={styles.playerItem}
                    onPress={() => handleSelectRecipient(player)}
                  >
                    <View style={styles.playerAvatar}>
                      <Text style={styles.playerAvatarText}>
                        {player.displayName?.charAt(0) || '#'}
                      </Text>
                    </View>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.displayName}</Text>
                      <Text style={styles.playerNumber}>Spieler #{player.participantNumber}</Text>
                    </View>
                    <Text style={styles.playerArrow}>→</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
        <View style={[styles.connectionBadge, isConnected ? styles.connected : styles.disconnected]}>
          <Text style={styles.connectionText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      {/* Channel Tabs */}
      <View style={styles.tabsContainer}>
        {availableChannels.map((channel) => (
          <TouchableOpacity
            key={channel}
            style={[
              styles.tab,
              activeChannel === channel && { backgroundColor: CHANNEL_CONFIG[channel].color },
            ]}
            onPress={() => handleChannelChange(channel)}
          >
            <Text style={[
              styles.tabText,
              activeChannel === channel && styles.tabTextActive,
            ]}>
              {CHANNEL_CONFIG[channel].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Selected Recipient Bar for DIRECT messages */}
      {activeChannel === ChatChannel.DIRECT && selectedRecipient && (
        <View style={styles.recipientBar}>
          <Text style={styles.recipientLabel}>Nachricht an:</Text>
          <Text style={styles.recipientName}>{selectedRecipient.displayName}</Text>
          <TouchableOpacity onPress={() => setShowPlayerPicker(true)}>
            <Text style={styles.changeRecipient}>Ändern</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message Limit Info for Players */}
      {activeChannel === ChatChannel.DIRECT && role?.toUpperCase() === 'PLAYER' && remainingMessages !== null && (
        <View style={[styles.messageLimitBar, remainingMessages === 0 && styles.messageLimitReached]}>
          <Text style={styles.messageLimitText}>
            {remainingMessages > 0 
              ? `📝 ${remainingMessages} Nachricht${remainingMessages !== 1 ? 'en' : ''} verbleibend`
              : '🚫 Nachrichtenlimit erreicht'}
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={channelMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={
            activeChannel === ChatChannel.DIRECT && !canSendDirectMessage()
              ? 'Nachrichtenlimit erreicht'
              : `Message ${CHANNEL_CONFIG[activeChannel].label}...`
          }
          placeholderTextColor="#9CA3AF"
          value={messageInput}
          onChangeText={setMessageInput}
          onSubmitEditing={handleSendMessage}
          editable={isConnected && (activeChannel !== ChatChannel.DIRECT || canSendDirectMessage())}
        />
        <TouchableOpacity
          style={[
            styles.sendButton, 
            (!isConnected || !messageInput.trim() || (activeChannel === ChatChannel.DIRECT && !canSendDirectMessage())) && styles.sendButtonDisabled
          ]}
          onPress={handleSendMessage}
          disabled={!isConnected || !messageInput.trim() || (activeChannel === ChatChannel.DIRECT && !canSendDirectMessage())}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  tabsContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#1F2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  tabText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  recipientBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#374151',
    borderBottomWidth: 1,
    borderBottomColor: '#4B5563',
  },
  recipientLabel: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  recipientName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  changeRecipient: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  messageLimitBar: {
    padding: 10,
    backgroundColor: '#1E3A5F',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    alignItems: 'center',
  },
  messageLimitReached: {
    backgroundColor: '#7F1D1D',
  },
  messageLimitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  directMessageButton: {
    margin: 12,
    padding: 12,
    backgroundColor: '#22C55E',
    borderRadius: 8,
    alignItems: 'center',
  },
  directMessageButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
  },
  messageContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderName: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  recipientArrowText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  roleBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  messageTime: {
    marginLeft: 'auto',
    color: '#6B7280',
    fontSize: 12,
  },
  messageContent: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemMessageText: {
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  input: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    color: '#9CA3AF',
    fontSize: 20,
    padding: 4,
  },
  playerList: {
    padding: 16,
  },
  noPlayersText: {
    color: '#6B7280',
    textAlign: 'center',
    padding: 20,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#374151',
    borderRadius: 12,
    marginBottom: 8,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  playerNumber: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  playerArrow: {
    color: '#6B7280',
    fontSize: 20,
  },
});
