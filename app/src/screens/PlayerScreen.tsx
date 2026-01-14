import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';
import { websocketService } from '../services/websocket.service';
import PanicButton from '../components/PanicButton';
import BatteryIndicator from '../components/BatteryIndicator';

// Helper function to format time ago
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return `vor ${diffSeconds} Sekunden`;
  } else if (diffMinutes < 60) {
    return `vor ${diffMinutes} Minute${diffMinutes !== 1 ? 'n' : ''}`;
  } else {
    return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
  }
};

export default function PlayerScreen() {
  const { participantId, gameId } = useAuthStore();
  const isConnected = useGameStore((state) => state.isConnected);
  const playerPings = useGameStore((state) => state.playerPings);
  const [timeAgo, setTimeAgo] = useState<string | null>(null);

  // Get the latest ping for this participant
  const lastPing = playerPings.find(ping => 
    ping.participantId === participantId || ping.userId === participantId
  );

  // Update time ago every second
  useEffect(() => {
    if (!lastPing) {
      setTimeAgo(null);
      return;
    }

    const updateTimeAgo = () => {
      const pingDate = new Date(lastPing.timestamp || lastPing.createdAt);
      setTimeAgo(formatTimeAgo(pingDate));
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [lastPing]);

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
      <View style={styles.header}>
        <Text style={styles.title}>PLAYER MODE</Text>
        <BatteryIndicator />
      </View>

      <View style={styles.content}>
        <Text style={styles.info}>
          GPS is always active
        </Text>
        <Text style={styles.info}>
          Position sent only on Orga request
        </Text>
        <Text style={styles.status}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Text>
        {lastPing ? (
          <Text style={styles.lastPing}>
            ✅ Letzter Ping {timeAgo}
          </Text>
        ) : (
          <Text style={styles.waiting}>⏳ Waiting for ping request...</Text>
        )}
        <Text style={styles.participantId}>ID: {participantId}</Text>
        {gameId && <Text style={styles.gameId}>Game: {gameId}</Text>}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Player Instructions</Text>
        <Text style={styles.infoText}>
          • Your position is tracked continuously{'\n'}
          • Position is only sent when Orga requests it{'\n'}
          • You cannot see hunter positions{'\n'}
          • Use panic button in emergency{'\n'}
          • Keep device charged at all times
        </Text>
      </View>

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
    color: '#00ff00',
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
    marginTop: 20,
    marginBottom: 10,
  },
  waiting: {
    fontSize: 18,
    color: '#ff0',
    marginTop: 10,
  },
  lastPing: {
    fontSize: 18,
    color: '#00ff00',
    marginTop: 10,
    fontWeight: 'bold',
  },
  participantId: {
    fontSize: 12,
    color: '#888',
    marginTop: 20,
  },
  gameId: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
  infoBox: {
    margin: 20,
    padding: 20,
    backgroundColor: '#111',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 15,
  },
  infoText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 22,
  },
});
