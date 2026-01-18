import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { silenthuntService } from '../services/silenthunt.service';
import * as Location from 'expo-location';

interface SilenthuntStatusBarProps {
  gameId: string;
}

export default function SilenthuntStatusBar({ gameId }: SilenthuntStatusBarProps) {
  const [enabled, setEnabled] = useState(false);
  const [countdown, setCountdown] = useState<string>('');
  const [zone, setZone] = useState<string>('');

  // Initialize silenthunt service
  useEffect(() => {
    const init = async () => {
      console.log('[SilenthuntStatusBar] Initializing for game:', gameId);
      
      const initialized = await silenthuntService.initialize(gameId);
      console.log('[SilenthuntStatusBar] Initialized:', initialized);
      setEnabled(initialized);
      
      if (initialized) {
        // Start automatic ping timer
        silenthuntService.startTimer(gameId, () => {
          console.log('[SilenthuntStatusBar] Ping sent by timer');
        });

        // Get initial location
        const { status } = await Location.requestForegroundPermissionsAsync();
        console.log('[SilenthuntStatusBar] Location permission:', status);
        
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          console.log('[SilenthuntStatusBar] Initial location obtained');
          silenthuntService.updateLocation(location);
        }
      }
    };

    init();

    return () => {
      silenthuntService.stopTimer();
    };
  }, [gameId]);

  // Location updates
  useEffect(() => {
    if (!enabled) return;

    let subscription: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[SilenthuntStatusBar] Location permission denied');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, // Update every 30 seconds
          distanceInterval: 50, // Or when moved 50 meters
        },
        (location) => {
          silenthuntService.updateLocation(location);
        }
      );
    };

    startLocationTracking();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [enabled]);

  // Countdown and zone display update
  useEffect(() => {
    if (!enabled) {
      setCountdown('');
      setZone('');
      return;
    }

    const updateDisplay = () => {
      const config = silenthuntService.getConfig();
      
      // Update zone display
      const zoneText = config.zone === 'INNER_ZONE' ? '🏙️ Inner Zone' : 
                       config.zone === 'OUTER_ZONE' ? '🌆 Outer Zone' : '❌ Outside';
      setZone(zoneText);

      // Get exact remaining time
      const nextPing = config.nextPingTime;
      if (!nextPing) {
        setCountdown('...');
        return;
      }

      const now = new Date();
      const diffMs = nextPing.getTime() - now.getTime();

      // Show "Now!" only if less than 5 seconds
      if (diffMs <= 5000) {
        setCountdown('Now!');
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setCountdown(`${minutes} min ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 1000); // Update every second for accuracy
    return () => clearInterval(interval);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🎯</Text>
      <View style={styles.infoContainer}>
        <View style={styles.row}>
          <Text style={styles.label}>Next Ping in</Text>
          <Text style={styles.countdown}>{countdown || '...'}</Text>
        </View>
        {zone && (
          <Text style={styles.zoneLabel}>{zone}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 8,
  },
  icon: {
    fontSize: 18,
  },
  infoContainer: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#888',
    fontSize: 14,
  },
  countdown: {
    color: '#ff6600',
    fontSize: 16,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  zoneLabel: {
    color: '#aaa',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
