import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface HunterAnfragenPanelProps {
  gameId: string;
}

export default function HunterAnfragenPanel({ gameId }: HunterAnfragenPanelProps) {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const participantId = useAuthStore((state) => state.participantId);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
  const [isAssigned, setIsAssigned] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const fetchStatus = useCallback(async () => {
    if (!participantId) return;
    
    try {
      const status = await apiService.getHunterAnfragenStatus(gameId, participantId);
      if (status) {
        setIsAssigned(status.isAssigned);
        setIsActive(status.isActive);
        setUsageCount(status.usageCount);
        if (status.expiresAt) {
          setExpiresAt(new Date(status.expiresAt));
        } else {
          setExpiresAt(null);
        }
      }
    } catch (error) {
      console.error('[HunterAnfragen] Failed to fetch status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    
    // Poll every 30 seconds for status updates
    const pollInterval = setInterval(fetchStatus, 30000);
    return () => clearInterval(pollInterval);
  }, [fetchStatus]);

  // Countdown timer
  useEffect(() => {
    if (!isActive || !expiresAt) {
      setTimeRemaining('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setIsActive(false);
        setExpiresAt(null);
        setTimeRemaining('');
        fetchStatus(); // Refresh status
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isActive, expiresAt, fetchStatus]);

  const handleActivate = async () => {
    if (!participantId) return;

    Alert.alert(
      'Activate Hunter Request',
      'Are you sure? You can only request hunter positions once per game. The map remains active for the set time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          style: 'default',
          onPress: async () => {
            setIsActivating(true);
            try {
              const result = await apiService.activateHunterAnfragen(gameId, participantId);
              if (result.success) {
                setIsActive(true);
                if (result.expiresAt) {
                  setExpiresAt(new Date(result.expiresAt));
                }
                setUsageCount(1);
                // Navigate to hunter map
                navigation.navigate('HunterMap', { gameId });
              } else {
                Alert.alert('Error', result.message || 'Hunter Request could not be activated');
              }
            } catch (error) {
              console.error('[HunterAnfragen] Activation failed:', error);
              Alert.alert('Error', 'Network error during activation');
            } finally {
              setIsActivating(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenMap = () => {
    navigation.navigate('HunterMap', { gameId });
  };

  // Don't show if not assigned
  if (!isLoading && !isAssigned) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#ff6600" />
      </View>
    );
  }

  // Already used and expired
  if (usageCount > 0 && !isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.icon}>🗺️</Text>
          <Text style={styles.title}>Hunter Request</Text>
        </View>
        <Text style={styles.usedText}>Already used</Text>
      </View>
    );
  }

  // Active with countdown - show map button
  if (isActive) {
    return (
      <View style={[styles.container, styles.activeContainer]}>
        <View style={styles.activeHeader}>
          <Text style={styles.icon}>🗺️</Text>
          <View style={styles.activeHeaderText}>
            <Text style={styles.activeTitle}>Hunter Map ACTIVE</Text>
            {timeRemaining ? (
              <Text style={styles.inlineCountdown}>⏱️ {timeRemaining}</Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity style={styles.mapButton} onPress={handleOpenMap}>
          <Text style={styles.mapButtonText}>📍 OPEN MAP</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Ready to activate
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>Hunter Request</Text>
      </View>
      <Text style={styles.description}>
        Activate to see the positions of the hunters on a map.
        Single use!
      </Text>
      <TouchableOpacity
        style={[styles.button, isActivating && styles.buttonDisabled]}
        onPress={handleActivate}
        disabled={isActivating}
      >
        {isActivating ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text style={styles.buttonText}>ACTIVATE</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeContainer: {
    backgroundColor: '#2a1a0a',
    borderColor: '#ff6600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeHeaderText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  activeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  inlineCountdown: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  description: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#ff6600',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#663300',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  countdownWrapper: {
    alignItems: 'center',
    marginBottom: 10,
  },
  countdownLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 2,
  },
  countdown: {
    color: '#ff6600',
    fontSize: 32,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  mapButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  mapButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  usedText: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
