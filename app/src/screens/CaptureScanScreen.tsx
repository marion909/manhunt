import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuthStore } from '../store/auth.store';
import { apiService } from '../services/api.service';

interface CaptureScanScreenProps {
  onCaptureSuccess: (captureId: string, playerName: string) => void;
  onCancel: () => void;
}

export default function CaptureScanScreen({ onCaptureSuccess, onCancel }: CaptureScanScreenProps) {
  const [scanned, setScanned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const { gameId, participantId } = useAuthStore();

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = useCallback(async (scanningResult: any) => {
    if (scanned || isProcessing) return;
    
    const { type, data } = scanningResult;
    
    // Only accept QR codes
    if (type !== 'qr') return;
    
    console.log('[CaptureScan] Scanned:', data);
    setScanned(true);
    setIsProcessing(true);

    try {
      // Parse capture QR code format: CAPTURE|gameId|participantId|captureSecret
      const parts = data.split('|');
      
      if (parts.length !== 4 || parts[0] !== 'CAPTURE') {
        throw new Error('Invalid capture QR code format');
      }

      const [, qrGameId, targetParticipantId, captureSecret] = parts;

      // Verify game matches
      if (qrGameId !== gameId) {
        throw new Error('QR code is for a different game');
      }

      // Call capture API
      const result = await apiService.captureByQRCode(gameId!, participantId!, targetParticipantId, captureSecret);

      if (result.success && result.capture) {
        // Navigate to handcuff photo screen
        onCaptureSuccess(result.capture.id, result.capture.playerName);
      } else {
        Alert.alert('Capture Failed', result.message || 'Could not capture player');
        setScanned(false);
      }
    } catch (error: any) {
      console.error('[CaptureScan] Error:', error);
      Alert.alert('Error', error.message || 'Failed to process capture');
      setScanned(false);
    } finally {
      setIsProcessing(false);
    }
  }, [scanned, isProcessing, gameId, participantId, onCaptureSuccess]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CAPTURE PLAYER</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Scan overlay */}
      <View style={styles.overlay}>
        <View style={styles.scanArea}>
          {isProcessing && (
            <ActivityIndicator size="large" color="#00ff00" />
          )}
        </View>
        <Text style={styles.instructions}>
          {isProcessing ? 'Processing capture...' : 'Scan player\'s QR code'}
        </Text>
        
        {scanned && !isProcessing && (
          <TouchableOpacity 
            style={styles.rescanButton} 
            onPress={() => setScanned(false)}
          >
            <Text style={styles.rescanButtonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Warning */}
      <View style={styles.warningContainer}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.warningText}>
          You must take a handcuff photo to confirm the capture
        </Text>
      </View>
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
    paddingTop: 50,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingBottom: 15,
  },
  backButton: {
    color: '#00ff00',
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    color: '#ff0000',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 200,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 280,
    height: 280,
    borderWidth: 3,
    borderColor: '#ff0000',
    backgroundColor: 'transparent',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructions: {
    color: '#fff',
    fontSize: 18,
    marginTop: 30,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#00ff00',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 15,
    marginTop: 15,
    alignSelf: 'center',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
  },
  rescanButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  rescanButtonText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffa500',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  warningText: {
    color: '#ffa500',
    fontSize: 14,
    flex: 1,
  },
});
