import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

interface SpeedhuntSession {
  id: string;
  targetParticipantId?: string;
  currentPing: number;
  totalPings: number;
  remainingPings: number;
  startedAt: string;
}

interface SpeedhuntStatusPanelProps {
  gameId: string;
  compact?: boolean;
  onSpeedhuntChange?: (speedhunt: { targetParticipantId: string; startedAt: string } | null) => void;
}

export default function SpeedhuntStatusPanel({ gameId, compact = false, onSpeedhuntChange }: SpeedhuntStatusPanelProps) {
  const token = useAuthStore((state) => state.token);
  const participantId = useAuthStore((state) => state.participantId);
  const hostname = useAuthStore((state) => state.hostname);
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isActive, setIsActive] = useState(false);
  const [sessions, setSessions] = useState<SpeedhuntSession[]>([]);
  const [isRuleEnabled, setIsRuleEnabled] = useState(false);
  const [tokenRefreshAttempted, setTokenRefreshAttempted] = useState(false);
  const pulseAnim = useState(new Animated.Value(1))[0];

  // Auto-refresh token if missing but we have participantId
  useEffect(() => {
    const refreshToken = async () => {
      if (!token && participantId && hostname && gameId && !tokenRefreshAttempted) {
        console.log('[SpeedhuntStatus] No token, attempting to get one...');
        setTokenRefreshAttempted(true);
        try {
          const result = await apiService.loginParticipant(hostname, gameId, participantId);
          if (result.success && result.token) {
            console.log('[SpeedhuntStatus] Got token successfully');
            // Update auth store with token
            const currentState = useAuthStore.getState();
            await setAuth({
              ...currentState,
              token: result.token,
            });
          }
        } catch (error) {
          console.error('[SpeedhuntStatus] Failed to refresh token:', error);
        }
      }
    };
    refreshToken();
  }, [token, participantId, hostname, gameId, tokenRefreshAttempted, setAuth]);

  // Pulsing animation when speedhunt is active
  useEffect(() => {
    if (isActive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive, pulseAnim]);

  const fetchStatus = useCallback(async () => {
    // Don't fetch if not authenticated
    if (!token) {
      console.log('[SpeedhuntStatus] No auth token, skipping fetch');
      return;
    }
    
    try {
      // First check if Speedhunt rule is enabled
      const enabled = await apiService.isRuleEnabled(gameId, 'SPEEDHUNT');
      setIsRuleEnabled(enabled);
      
      if (!enabled) {
        onSpeedhuntChange?.(null);
        return;
      }

      const status = await apiService.getGlobalSpeedhuntStatus(gameId);
      setIsActive(status.active);
      setSessions(status.sessions);
      
      // Notify parent about active speedhunt for auto-filtering
      if (status.active && status.sessions.length > 0) {
        const session = status.sessions[0];
        onSpeedhuntChange?.({
          targetParticipantId: session.targetParticipantId || session.id,
          startedAt: session.startedAt,
        });
      } else {
        onSpeedhuntChange?.(null);
      }
    } catch (error) {
      console.error('[SpeedhuntStatus] Failed to fetch status:', error);
    }
  }, [gameId, token, onSpeedhuntChange]);

  // Initial fetch and polling
  useEffect(() => {
    if (!token) return; // Don't poll without auth
    
    fetchStatus();
    
    // Poll every 5 seconds for active speedhunt updates
    const pollInterval = setInterval(fetchStatus, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchStatus, token]);

  // Don't render if rule is not enabled
  if (!isRuleEnabled) {
    return null;
  }

  // Don't show panel if no active speedhunt
  if (!isActive || sessions.length === 0) {
    return null;
  }

  // Compact mode - single line for Hunter screen
  if (compact) {
    const session = sessions[0];
    return (
      <View style={styles.compactContainer}>
        <Text style={styles.compactIcon}>🎯</Text>
        <Text style={styles.compactText}>SPEEDHUNT</Text>
        <Text style={styles.compactPing}>{session.currentPing}/{session.totalPings}</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>🎯</Text>
        <Text style={styles.title}>SPEEDHUNT ACTIVE</Text>
      </View>
      
      {sessions.map((session) => (
        <View key={session.id} style={styles.sessionContainer}>
          <View style={styles.pingInfo}>
            <Text style={styles.pingLabel}>Speedhunt Ping</Text>
            <Text style={styles.pingCounter}>
              {session.currentPing} / {session.totalPings}
            </Text>
          </View>
          
          <View style={styles.progressContainer}>
            {Array.from({ length: session.totalPings }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index < session.currentPing - 1
                    ? styles.progressDotUsed
                    : index === session.currentPing - 1
                    ? styles.progressDotCurrent
                    : styles.progressDotRemaining,
                ]}
              />
            ))}
          </View>
          
          <Text style={styles.remainingText}>
            {session.remainingPings} ping{session.remainingPings !== 1 ? 's' : ''} remaining
          </Text>
        </View>
      ))}
      
      <Text style={styles.warningText}>
        ⚠️ A hunter is currently hunting a player!
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a1a00',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ff6600',
    gap: 8,
  },
  compactIcon: {
    fontSize: 16,
  },
  compactText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff6600',
    letterSpacing: 1,
  },
  compactPing: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffaa00',
  },
  container: {
    backgroundColor: '#2a1a00',
    borderWidth: 2,
    borderColor: '#ff6600',
    borderRadius: 12,
    padding: 16,
    marginVertical: 10,
    shadowColor: '#ff6600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 24,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
    letterSpacing: 2,
  },
  sessionContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  pingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pingLabel: {
    fontSize: 14,
    color: '#999',
  },
  pingCounter: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  progressDotUsed: {
    backgroundColor: '#444',
    borderWidth: 1,
    borderColor: '#666',
  },
  progressDotCurrent: {
    backgroundColor: '#ff6600',
    borderWidth: 2,
    borderColor: '#ffaa00',
    shadowColor: '#ff6600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  progressDotRemaining: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#ff6600',
  },
  remainingText: {
    fontSize: 12,
    color: '#ffaa00',
    marginTop: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#ff9900',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
