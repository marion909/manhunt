import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { websocketService } from '../services/websocket.service';
import { chatService } from '../services/chat.service';
import { voiceService } from '../services/voice.service';
import { locationService } from '../services/location.service';

export default function SettingsScreen() {
  const name = useAuthStore((state) => state.name);
  const role = useAuthStore((state) => state.role);
  const hostname = useAuthStore((state) => state.hostname);
  const gameId = useAuthStore((state) => state.gameId);
  const participantId = useAuthStore((state) => state.participantId);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to leave the game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            // Disconnect all services
            websocketService.disconnect();
            chatService.disconnect();
            voiceService.disconnect();
            locationService.stopWatching();
            
            // Clear auth
            await logout();
          },
        },
      ]
    );
  };

  const getRoleColor = () => {
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

  const getRoleLabel = () => {
    switch (role?.toUpperCase()) {
      case 'ORGA':
        return 'Organizer';
      case 'OPERATOR':
        return 'Operator';
      case 'HUNTER':
        return 'Hunter';
      case 'PLAYER':
        return 'Player';
      default:
        return role;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Profile Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profile</Text>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{name || 'Unknown'}</Text>
          </View>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>Role</Text>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor() }]}>
              <Text style={styles.roleBadgeText}>{getRoleLabel()}</Text>
            </View>
          </View>
        </View>

        {/* Connection Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connection</Text>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>Server</Text>
            <Text style={styles.value}>{hostname || 'Not connected'}</Text>
          </View>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>Game ID</Text>
            <Text style={styles.valueSmall}>{gameId?.substring(0, 8) || 'N/A'}...</Text>
          </View>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>Participant ID</Text>
            <Text style={styles.valueSmall}>{participantId?.substring(0, 8) || 'N/A'}...</Text>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>App Version</Text>
            <Text style={styles.value}>1.0.0</Text>
          </View>
          
          <View style={styles.profileRow}>
            <Text style={styles.label}>Build</Text>
            <Text style={styles.value}>2024.01</Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Leave Game</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          MANHUNT © 2024
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#1F2937',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  label: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  valueSmall: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 32,
  },
});
