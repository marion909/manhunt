import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, StatusBar } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';
import { websocketService } from '../services/websocket.service';
import { apiService } from '../services/api.service';
import { pingService } from '../services/ping.service';
import PanicButton from '../components/PanicButton';
import BatteryIndicator from '../components/BatteryIndicator';
import SpeedhuntStatusPanel from '../components/SpeedhuntStatusPanel';
import SilenthuntStatusBar from '../components/SilenthuntStatusBar';
import QRCodePanel from '../components/QRCodePanel';
import JokerGrid from '../components/JokerGrid';

interface GameInfo {
  id: string;
  name: string;
  status: string;
  startTime?: string;
}

export default function PlayerScreen() {
  const { gameId } = useAuthStore();
  const isConnected = useGameStore((state) => state.isConnected);
  const setGame = useGameStore((state) => state.setGame);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);

  // Fetch game info (including status)
  const fetchGameInfo = useCallback(async () => {
    if (!gameId) return;
    try {
      const info = await apiService.getGameInfo(gameId);
      if (info) {
        setGameInfo(info);
        // Update global store so TabNavigator can access status
        setGame(info as any);
      }
    } catch (err) {
      console.error('[PlayerScreen] Failed to fetch game info:', err);
    }
  }, [gameId, setGame]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchGameInfo();
    const refreshInterval = setInterval(fetchGameInfo, 5000); // Check every 5 seconds
    return () => clearInterval(refreshInterval);
  }, [fetchGameInfo]);

  // Start/stop ping service based on game status
  useEffect(() => {
    if (gameInfo?.status?.toUpperCase() === 'ACTIVE') {
      console.log('[PlayerScreen] Game is ACTIVE, starting ping service');
      pingService.start();
    } else {
      console.log('[PlayerScreen] Game is not ACTIVE, stopping ping service');
      pingService.stop();
    }

    return () => {
      pingService.stop();
    };
  }, [gameInfo?.status]);

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

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <View style={styles.header}>
        <Text style={styles.title}>PLAYER MODE</Text>
        <View style={styles.headerRight}>
          <View style={[styles.connectionDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
          <BatteryIndicator />
        </View>
      </View>

      {/* Silenthunt Status Bar - shows next ping time */}
      {gameId && <SilenthuntStatusBar gameId={gameId} />}

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainer}>
        {/* QR Code for Capture */}
        {gameId && (
          <View style={styles.qrSection}>
            <QRCodePanel gameId={gameId} />
          </View>
        )}

        {/* Game Status Panels */}
        {gameId && (
          <View style={styles.rulesSection}>
            <SpeedhuntStatusPanel gameId={gameId} />
          </View>
        )}

        {/* Joker Grid */}
        {gameId && (
          <View style={styles.jokersSection}>
            <JokerGrid gameId={gameId} />
          </View>
        )}
      </ScrollView>

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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotConnected: {
    backgroundColor: '#00ff00',
  },
  dotDisconnected: {
    backgroundColor: '#ff0000',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00ff00',
    letterSpacing: 2,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 100,
  },
  qrSection: {
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  rulesSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 10,
  },
  jokersSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});
