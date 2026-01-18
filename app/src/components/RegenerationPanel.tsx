import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

interface RegenerationPanelProps {
  gameId: string;
}

export default function RegenerationPanel({ gameId }: RegenerationPanelProps) {
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
      const status = await apiService.getRegenerationStatus(gameId, participantId);
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
      console.error('[Regeneration] Failed to fetch status:', error);
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
      'Activate Regeneration',
      'Are you sure? You can only use Regeneration once per game. During regeneration you are protected from pings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          style: 'default',
          onPress: async () => {
            setIsActivating(true);
            try {
              const result = await apiService.activateRegeneration(gameId, participantId);
              if (result.success) {
                setIsActive(true);
                if (result.expiresAt) {
                  setExpiresAt(new Date(result.expiresAt));
                }
                setUsageCount(1);
              } else {
                Alert.alert('Error', result.message || 'Regeneration could not be activated');
              }
            } catch (error) {
              console.error('[Regeneration] Activation failed:', error);
              Alert.alert('Error', 'Network error during activation');
            } finally {
              setIsActivating(false);
            }
          },
        },
      ]
    );
  };

  // Don't show if not assigned
  if (!isLoading && !isAssigned) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#00ff00" />
      </View>
    );
  }

  // Already used
  if (usageCount > 0 && !isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.icon}>🛡️</Text>
          <Text style={styles.title}>Regeneration</Text>
        </View>
        <Text style={styles.usedText}>Already used</Text>
      </View>
    );
  }

  // Active with countdown
  if (isActive) {
    return (
      <View style={[styles.container, styles.activeContainer]}>
        <View style={styles.header}>
          <Text style={styles.icon}>🛡️</Text>
          <Text style={styles.title}>Regeneration ACTIVE</Text>
        </View>
        <View style={styles.countdownWrapper}>
          <Text style={styles.countdownLabel}>Ping protection remaining:</Text>
          <Text style={styles.countdown}>{timeRemaining}</Text>
        </View>
        <Text style={styles.activeInfo}>You are protected from pings!</Text>
      </View>
    );
  }

  // Ready to activate
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🛡️</Text>
        <Text style={styles.title}>Regeneration</Text>
      </View>
      <Text style={styles.description}>
        Activate Regeneration to be protected from pings for a short time.
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
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeContainer: {
    backgroundColor: '#0a2a0a',
    borderColor: '#00ff00',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff00',
  },
  description: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#00ff00',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#006600',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  countdownWrapper: {
    alignItems: 'center',
    marginBottom: 8,
  },
  countdownLabel: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 4,
  },
  countdown: {
    color: '#00ff00',
    fontSize: 48,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  activeInfo: {
    color: '#00ff00',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  usedText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
});
