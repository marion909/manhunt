import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

interface JokerGridProps {
  gameId: string;
}

interface JokerState {
  id: string;
  name: string;
  icon: string;
  isAssigned: boolean;
  isActive: boolean;
  isUsed: boolean;
  timeRemaining?: string;
  onActivate?: () => Promise<void>;
}

export default function JokerGrid({ gameId }: JokerGridProps) {
  const participantId = useAuthStore((state) => state.participantId);
  const [isLoading, setIsLoading] = useState(true);
  const [jokers, setJokers] = useState<JokerState[]>([]);

  const fetchJokerStatus = useCallback(async () => {
    if (!participantId) {
      console.log('[JokerGrid] No participantId, skipping fetch');
      return;
    }

    try {
      console.log('[JokerGrid] Fetching joker status for participant:', participantId);
      // Fetch all joker states in parallel
      const [catchFreeStatus, hotelBonusStatus, fakePingStatus, regenerationStatus, hunterAnfragenStatus] = await Promise.all([
        apiService.getCatchFreeStatus(gameId, participantId).catch((e) => { console.log('[JokerGrid] catchFree error:', e); return null; }),
        apiService.getHotelBonusStatus(gameId, participantId).catch((e) => { console.log('[JokerGrid] hotelBonus error:', e); return null; }),
        apiService.getFakePingStatus(gameId, participantId).catch((e) => { console.log('[JokerGrid] fakePing error:', e); return null; }),
        apiService.getRegenerationStatus(gameId, participantId).catch((e) => { console.log('[JokerGrid] regeneration error:', e); return null; }),
        apiService.getHunterAnfragenStatus(gameId, participantId).catch((e) => { console.log('[JokerGrid] hunterAnfragen error:', e); return null; }),
      ]);

      console.log('[JokerGrid] Statuses:', { catchFreeStatus, hotelBonusStatus, fakePingStatus, regenerationStatus, hunterAnfragenStatus });

      const jokerStates: JokerState[] = [];

      // Regeneration Joker - Backend returns 'assigned', not 'isAssigned'
      const regenAssigned = regenerationStatus?.isAssigned ?? regenerationStatus?.assigned;
      console.log('[JokerGrid] Regeneration assigned:', regenAssigned, regenerationStatus);
      if (regenAssigned) {
        jokerStates.push({
          id: 'regeneration',
          name: 'Regeneration',
          icon: '🔄',
          isAssigned: true,
          isActive: regenerationStatus.isActive ?? regenerationStatus.active ?? false,
          isUsed: (regenerationStatus.usageCount ?? 0) > 0 && !(regenerationStatus.isActive ?? regenerationStatus.active),
          timeRemaining: (regenerationStatus.isActive ?? regenerationStatus.active) && regenerationStatus.expiresAt 
            ? formatTimeRemaining(new Date(regenerationStatus.expiresAt)) 
            : undefined,
        });
      }

      // Hunter Anfragen Joker - Backend returns 'assigned', not 'isAssigned'
      const hunterAssigned = hunterAnfragenStatus?.isAssigned ?? hunterAnfragenStatus?.assigned;
      if (hunterAssigned) {
        jokerStates.push({
          id: 'hunter-anfragen',
          name: 'Hunter Orten',
          icon: '🔍',
          isAssigned: true,
          isActive: hunterAnfragenStatus.isActive ?? hunterAnfragenStatus.active ?? false,
          isUsed: (hunterAnfragenStatus.usageCount ?? 0) > 0 && !(hunterAnfragenStatus.isActive ?? hunterAnfragenStatus.active),
          timeRemaining: (hunterAnfragenStatus.isActive ?? hunterAnfragenStatus.active) && hunterAnfragenStatus.expiresAt 
            ? formatTimeRemaining(new Date(hunterAnfragenStatus.expiresAt)) 
            : undefined,
        });
      }

      // Catch-Free Joker - Backend returns 'assigned', not 'isAssigned'
      const catchFreeAssigned = catchFreeStatus?.isAssigned ?? catchFreeStatus?.assigned;
      if (catchFreeAssigned) {
        jokerStates.push({
          id: 'catch-free',
          name: 'Catch-Free',
          icon: '🛡️',
          isAssigned: true,
          isActive: catchFreeStatus.isActive ?? catchFreeStatus.active ?? false,
          isUsed: (catchFreeStatus.used || (catchFreeStatus.usageCount ?? 0) > 0) && !(catchFreeStatus.isActive ?? catchFreeStatus.active),
          timeRemaining: (catchFreeStatus.isActive ?? catchFreeStatus.active) && catchFreeStatus.expiresAt 
            ? formatTimeRemaining(new Date(catchFreeStatus.expiresAt)) 
            : undefined,
        });
      }

      // Hotel-Bonus Joker - Backend returns 'assigned', not 'isAssigned'
      const hotelBonusAssigned = hotelBonusStatus?.isAssigned ?? hotelBonusStatus?.assigned;
      if (hotelBonusAssigned) {
        jokerStates.push({
          id: 'hotel-bonus',
          name: 'Hotel-Bonus',
          icon: '🏨',
          isAssigned: true,
          isActive: hotelBonusStatus.isActive ?? hotelBonusStatus.active ?? false,
          isUsed: (hotelBonusStatus.used || (hotelBonusStatus.usageCount ?? 0) > 0) && !(hotelBonusStatus.isActive ?? hotelBonusStatus.active),
          timeRemaining: (hotelBonusStatus.isActive ?? hotelBonusStatus.active) && hotelBonusStatus.expiresAt 
            ? formatTimeRemaining(new Date(hotelBonusStatus.expiresAt)) 
            : undefined,
        });
      }

      // Fake-Ping Joker - Backend returns 'assigned', not 'isAssigned'
      const fakePingAssigned = fakePingStatus?.isAssigned ?? fakePingStatus?.assigned;
      if (fakePingAssigned) {
        jokerStates.push({
          id: 'fake-ping',
          name: 'Fake-Ping',
          icon: '📍',
          isAssigned: true,
          isActive: false, // Fake-Ping doesn't have active state, it's one-time use
          isUsed: fakePingStatus.used || (fakePingStatus.usageCount ?? 0) > 0,
        });
      }

      setJokers(jokerStates);
    } catch (error) {
      console.error('[JokerGrid] Failed to fetch joker status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  useEffect(() => {
    fetchJokerStatus();
    const interval = setInterval(fetchJokerStatus, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchJokerStatus]);

  // Timer update effect
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setJokers(prev => prev.map(joker => {
        if (joker.isActive && joker.id === 'catch-free') {
          // Update time remaining for active jokers
          return joker; // Will be updated on next fetch
        }
        return joker;
      }));
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  const handleJokerPress = async (joker: JokerState) => {
    if (joker.isUsed) {
      Alert.alert('Joker used', `${joker.name} was already used.`);
      return;
    }

    if (joker.isActive) {
      Alert.alert('Joker active', `${joker.name} is already active.`);
      return;
    }

    // Handle activation based on joker type
    if (joker.id === 'catch-free') {
      Alert.alert(
        'Activate Catch-Free',
        'Are you sure? You are protected from capture for 3 hours. This joker can only be used once per game.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate',
            onPress: async () => {
              try {
                await apiService.activateCatchFree(gameId, participantId!);
                fetchJokerStatus();
              } catch (error) {
                Alert.alert('Error', 'Joker could not be activated.');
              }
            },
          },
        ]
      );
    } else if (joker.id === 'hotel-bonus') {
      Alert.alert(
        'Activate Hotel-Bonus',
        'Are you sure? You are protected from pings for 6 hours. After expiration, an automatic ping occurs. This joker can only be used once per game.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate',
            onPress: async () => {
              try {
                await apiService.activateHotelBonus(gameId, participantId!);
                fetchJokerStatus();
              } catch (error) {
                Alert.alert('Error', 'Joker could not be activated.');
              }
            },
          },
        ]
      );
    } else if (joker.id === 'fake-ping') {
      Alert.alert(
        'Use Fake-Ping',
        'You can send a fake ping to the hunters. Tap on the map to choose the location.',
        [{ text: 'OK' }]
      );
    } else if (joker.id === 'regeneration') {
      Alert.alert(
        'Activate Regeneration',
        'Are you sure? You are protected from pings for 30 minutes. This joker can only be used once per game.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate',
            onPress: async () => {
              try {
                await apiService.activateRegeneration(gameId, participantId!);
                fetchJokerStatus();
              } catch (error) {
                Alert.alert('Error', 'Joker could not be activated.');
              }
            },
          },
        ]
      );
    } else if (joker.id === 'hunter-anfragen') {
      Alert.alert(
        'Activate Locate Hunters',
        'Are you sure? You see the positions of all hunters for 5 minutes. This joker can only be used once per game.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate',
            onPress: async () => {
              try {
                await apiService.activateHunterAnfragen(gameId, participantId!);
                fetchJokerStatus();
              } catch (error) {
                Alert.alert('Error', 'Joker could not be activated.');
              }
            },
          },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>🃏 Joker</Text>
        <ActivityIndicator color="#00ff00" />
      </View>
    );
  }

  if (jokers.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>🃏 Joker</Text>
        <Text style={styles.noJokers}>No jokers assigned</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>🃏 Joker</Text>
      <View style={styles.grid}>
        {jokers.map((joker) => (
          <TouchableOpacity
            key={joker.id}
            style={[
              styles.jokerItem,
              joker.isUsed && styles.jokerUsed,
              joker.isActive && styles.jokerActive,
            ]}
            onPress={() => handleJokerPress(joker)}
            disabled={joker.isUsed}
          >
            <Text style={[styles.jokerIcon, joker.isUsed && styles.jokerIconUsed]}>
              {joker.icon}
            </Text>
            <Text style={[styles.jokerName, joker.isUsed && styles.jokerNameUsed]}>
              {joker.name}
            </Text>
            {joker.isActive && joker.timeRemaining && (
              <Text style={styles.timeRemaining}>{joker.timeRemaining}</Text>
            )}
            {joker.isActive && !joker.timeRemaining && (
              <Text style={styles.activeLabel}>ACTIVE</Text>
            )}
            {joker.isUsed && (
              <Text style={styles.usedLabel}>USED</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  
  if (diff <= 0) return '';
  
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  jokerItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#333',
  },
  jokerActive: {
    borderColor: '#00ff00',
    backgroundColor: '#0a2a0a',
  },
  jokerUsed: {
    backgroundColor: '#0d0d0d',
    borderColor: '#222',
    opacity: 0.5,
  },
  jokerIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  jokerIconUsed: {
    opacity: 0.4,
  },
  jokerName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  jokerNameUsed: {
    color: '#666',
  },
  timeRemaining: {
    color: '#00ff00',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 4,
  },
  activeLabel: {
    color: '#00ff00',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  usedLabel: {
    color: '#666',
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 4,
  },
  noJokers: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
});
