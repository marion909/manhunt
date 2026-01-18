import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

interface HotelBonusPanelProps {
  gameId: string;
}

export default function HotelBonusPanel({ gameId }: HotelBonusPanelProps) {
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
      const status = await apiService.getHotelBonusStatus(gameId, participantId);
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
      console.error('[HotelBonus] Failed to fetch status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  useEffect(() => {
    fetchStatus();
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
        fetchStatus();
        Alert.alert('⚠️ Hotel-Bonus expired', 'Your location was just pinged!');
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      if (hours > 0) {
        setTimeRemaining(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isActive, expiresAt, fetchStatus]);

  const handleActivate = async () => {
    if (!participantId) return;

    Alert.alert(
      'Activate Hotel-Bonus',
      'Are you sure? The Hotel-Bonus pauses all pings for 6 hours. WARNING: After expiration, a ping will be triggered immediately!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          style: 'default',
          onPress: async () => {
            setIsActivating(true);
            try {
              const result = await apiService.activateHotelBonus(gameId, participantId);
              if (result.success) {
                setIsActive(true);
                if (result.expiresAt) {
                  setExpiresAt(new Date(result.expiresAt));
                }
                setUsageCount(1);
              } else {
                Alert.alert('Error', result.message || 'Hotel-Bonus could not be activated');
              }
            } catch (error) {
              console.error('[HotelBonus] Activation failed:', error);
              Alert.alert('Error', 'Network error during activation');
            } finally {
              setIsActivating(false);
            }
          },
        },
      ]
    );
  };

  if (!isLoading && !isAssigned) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#ffa500" />
      </View>
    );
  }

  // Already used
  if (usageCount > 0 && !isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.icon}>🏨</Text>
          <Text style={styles.title}>Hotel-Bonus</Text>
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
          <Text style={styles.icon}>🏨</Text>
          <Text style={styles.title}>Hotel-Bonus ACTIVE</Text>
        </View>
        <View style={styles.countdownWrapper}>
          <Text style={styles.countdownLabel}>Pause ends in:</Text>
          <Text style={styles.countdown}>{timeRemaining}</Text>
        </View>
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            After expiration, a ping will be triggered immediately!
          </Text>
        </View>
      </View>
    );
  }

  // Available to activate
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🏨</Text>
        <Text style={styles.title}>Hotel-Bonus</Text>
      </View>
      <Text style={styles.description}>
        6 hours pause from all pings. You will be pinged immediately after expiration!
      </Text>
      <TouchableOpacity
        style={[styles.activateButton, isActivating && styles.buttonDisabled]}
        onPress={handleActivate}
        disabled={isActivating}
      >
        {isActivating ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text style={styles.activateButtonText}>Activate</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeContainer: {
    borderColor: '#ffa500',
    backgroundColor: '#2a1a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  description: {
    color: '#888',
    fontSize: 14,
    marginBottom: 15,
  },
  usedText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
  countdownWrapper: {
    alignItems: 'center',
    marginVertical: 10,
  },
  countdownLabel: {
    color: '#888',
    fontSize: 12,
  },
  countdown: {
    color: '#ffa500',
    fontSize: 36,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  warningText: {
    color: '#ffa500',
    fontSize: 12,
    flex: 1,
  },
  activateButton: {
    backgroundColor: '#ffa500',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  activateButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
