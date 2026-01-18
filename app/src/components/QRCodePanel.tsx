import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuthStore } from '../store/auth.store';
import { apiService } from '../services/api.service';

interface QRCodePanelProps {
  gameId: string;
}

export default function QRCodePanel({ gameId }: QRCodePanelProps) {
  const { participantId, name } = useAuthStore();
  const [captureSecret, setCaptureSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCatchFreeActive, setIsCatchFreeActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchCaptureInfo = useCallback(async () => {
    if (!participantId) return;
    
    try {
      // Fetch participant info to get capture secret
      const info = await apiService.getParticipantCaptureInfo(gameId, participantId);
      if (info) {
        setCaptureSecret(info.captureSecret);
        setIsCatchFreeActive(info.isCatchFreeActive || false);
      }
    } catch (error) {
      console.error('[QRCodePanel] Failed to fetch capture info:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  useEffect(() => {
    fetchCaptureInfo();
    
    // Refresh every 30 seconds to check catch-free status
    const interval = setInterval(fetchCaptureInfo, 30000);
    return () => clearInterval(interval);
  }, [fetchCaptureInfo]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#00ff00" />
      </View>
    );
  }

  if (!captureSecret) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>QR Code not available</Text>
      </View>
    );
  }

  // Generate QR code data: CAPTURE|gameId|participantId|captureSecret
  const qrData = `CAPTURE|${gameId}|${participantId}|${captureSecret}`;

  return (
    <View style={[styles.container, isCatchFreeActive && styles.containerProtected]}>
      <TouchableOpacity 
        style={styles.header} 
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>📱</Text>
        <Text style={styles.title}>Your Capture QR</Text>
        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        isCatchFreeActive ? (
          <View style={styles.protectedBadge}>
            <Text style={styles.protectedIcon}>🛡️</Text>
            <Text style={styles.protectedText}>CATCH-FREE ACTIVE</Text>
            <Text style={styles.protectedSubtext}>You cannot be caught</Text>
          </View>
        ) : (
          <>
            <View style={styles.qrContainer}>
              <QRCode
                value={qrData}
                size={180}
                color="#000"
                backgroundColor="#fff"
                ecl="M"
              />
            </View>
            
            <Text style={styles.nameText}>{name}</Text>
            <Text style={styles.hintText}>Show this to a Hunter when caught</Text>
          </>
        )
      )}
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
  containerProtected: {
    borderColor: '#00ff00',
    backgroundColor: '#0a2a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  expandIcon: {
    color: '#888',
    fontSize: 14,
  },
  qrContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
  },
  nameText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 5,
  },
  hintText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
  errorText: {
    color: '#ff0000',
    fontSize: 14,
    textAlign: 'center',
  },
  protectedBadge: {
    alignItems: 'center',
    padding: 20,
  },
  protectedIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  protectedText: {
    color: '#00ff00',
    fontSize: 20,
    fontWeight: 'bold',
  },
  protectedSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 5,
  },
});
