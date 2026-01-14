import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { websocketService } from '../services/websocket.service';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';
import PanicButton from '../components/PanicButton';
import BatteryIndicator from '../components/BatteryIndicator';

export default function HunterScreen() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { participantId, gameId, logout } = useAuthStore();
  const isConnected = useGameStore((state) => state.isConnected);

  useEffect(() => {
    // Start sending position every 10 seconds
    intervalRef.current = setInterval(() => {
      console.log('Hunter: Sending position update');
      websocketService.sendPosition();
    }, 10000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handlePanic = () => {
    Alert.alert(
      'Panic Button',
      'Send emergency position?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: () => websocketService.sendPanic(),
        },
      ]
    );
  };

  const handleRescan = () => {
    Alert.alert(
      'Neuen QR-Code scannen',
      'Möchtest du dich abmelden und einen neuen QR-Code scannen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Ja, abmelden',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HUNTER MODE</Text>
        <BatteryIndicator />
      </View>

      <View style={styles.content}>
        <Text style={styles.info}>
          Position updates: Every 10 seconds
        </Text>
        <Text style={styles.status}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Text>
        <Text style={styles.participantId}>ID: {participantId}</Text>
        {gameId && <Text style={styles.gameId}>Game: {gameId}</Text>}
      </View>

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>Map will be displayed here</Text>
        <Text style={styles.mapSubtext}>
          Shows game boundary and other hunters
        </Text>
      </View>

      <TouchableOpacity style={styles.rescanButton} onPress={handleRescan}>
        <Text style={styles.rescanButtonText}>📱 Neuen QR-Code scannen</Text>
      </TouchableOpacity>

      <PanicButton onPress={handlePanic} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff0000',
    letterSpacing: 2,
  },
  content: {
    padding: 20,
  },
  info: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
  status: {
    fontSize: 18,
    color: '#0f0',
    marginBottom: 10,
  },
  participantId: {
    fontSize: 12,
    color: '#888',
    marginTop: 10,
  },
  gameId: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    margin: 20,
    borderRadius: 10,
  },
  mapText: {
    fontSize: 18,
    color: '#666',
  },
  mapSubtext: {
    fontSize: 14,
    color: '#444',
    marginTop: 10,
  },
  rescanButton: {
    backgroundColor: '#333',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  rescanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
