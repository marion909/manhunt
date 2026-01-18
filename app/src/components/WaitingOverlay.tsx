import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

interface WaitingOverlayProps {
  gameName?: string;
  gameStatus?: string;
  status?: string;
  startTime?: string;
}

const { width, height } = Dimensions.get('window');

export default function WaitingOverlay({ gameName, gameStatus, status, startTime }: WaitingOverlayProps) {
  const actualStatus = status || gameStatus;
  const [dots, setDots] = useState('');
  const [countdown, setCountdown] = useState<string | null>(null);

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Countdown if scheduled start
  useEffect(() => {
    if (!startTime) return;

    const startTimeMs = new Date(startTime).getTime();
    
    const updateCountdown = () => {
      const now = Date.now();
      const diff = startTimeMs - now;
      
      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setCountdown(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const getStatusText = () => {
    switch (actualStatus?.toLowerCase()) {
      case 'draft':
        return 'Draft';
      case 'pending':
        return 'Waiting';
      case 'paused':
        return 'Paused';
      case 'finished':
        return 'Finished';
      default:
        return actualStatus || 'Unknown';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>⏳</Text>
        
        <Text style={styles.title}>
          Waiting for game start{dots}
        </Text>
        
        <Text style={styles.subtitle}>
          The game has not been started yet.
        </Text>

        {/* Game Name */}
        {gameName && (
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Game</Text>
            <Text style={styles.infoValue}>{gameName}</Text>
          </View>
        )}

        {/* Countdown */}
        {countdown && (
          <View style={[styles.infoBox, styles.countdownBox]}>
            <Text style={styles.countdownLabel}>Starting in</Text>
            <Text style={styles.countdownValue}>{countdown}</Text>
          </View>
        )}

        {/* Status Badge */}
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        <Text style={styles.footer}>
          The game organization will start the game.
          {'\n'}
          This view updates automatically.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: width,
    height: height,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 350,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBox: {
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  countdownBox: {
    backgroundColor: 'rgba(30, 58, 138, 0.5)',
  },
  countdownLabel: {
    fontSize: 12,
    color: '#93c5fd',
  },
  countdownValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eab308',
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#d1d5db',
  },
  footer: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});
