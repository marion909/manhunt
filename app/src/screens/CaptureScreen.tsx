import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import CaptureScanScreen from './CaptureScanScreen';
import HandcuffPhotoScreen from './HandcuffPhotoScreen';

type CaptureState = 'idle' | 'scanning' | 'handcuff';

interface PendingCapture {
  id: string;
  playerName: string;
}

export default function CaptureScreen() {
  const [state, setState] = useState<CaptureState>('idle');
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);

  const handleStartCapture = () => {
    setState('scanning');
  };

  const handleCaptureSuccess = (captureId: string, playerName: string) => {
    setPendingCapture({ id: captureId, playerName });
    setState('handcuff');
  };

  const handleCancelScan = () => {
    setState('idle');
    setPendingCapture(null);
  };

  const handleCaptureComplete = () => {
    setState('idle');
    setPendingCapture(null);
  };

  const handleCancelHandcuff = () => {
    // Note: The capture is already in PENDING_HANDCUFF state
    // They can complete it later or it will expire
    setState('idle');
    setPendingCapture(null);
  };

  // Scanning mode
  if (state === 'scanning') {
    return (
      <CaptureScanScreen
        onCaptureSuccess={handleCaptureSuccess}
        onCancel={handleCancelScan}
      />
    );
  }

  // Handcuff photo mode
  if (state === 'handcuff' && pendingCapture) {
    return (
      <HandcuffPhotoScreen
        captureId={pendingCapture.id}
        playerName={pendingCapture.playerName}
        onComplete={handleCaptureComplete}
        onCancel={handleCancelHandcuff}
      />
    );
  }

  // Idle mode - show capture button
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <View style={styles.header}>
        <Text style={styles.title}>CAPTURE</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.mainIcon}>🎯</Text>
        </View>

        <Text style={styles.heading}>Ready to Capture</Text>
        <Text style={styles.description}>
          Scan a player's QR code to initiate a capture. You'll need to take a handcuff photo to confirm.
        </Text>

        <TouchableOpacity style={styles.captureButton} onPress={handleStartCapture}>
          <Text style={styles.captureButtonIcon}>📷</Text>
          <Text style={styles.captureButtonText}>SCAN QR CODE</Text>
        </TouchableOpacity>

        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>Capture Steps:</Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>Get close to the player</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>Scan their QR code</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>Apply handcuffs</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>Take handcuff photo</Text>
          </View>
        </View>
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff0000',
    letterSpacing: 3,
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 2,
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  mainIcon: {
    fontSize: 60,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff0000',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 40,
  },
  captureButtonIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  stepsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#333',
  },
  stepsTitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 15,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    color: '#ff0000',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  stepText: {
    color: '#fff',
    fontSize: 14,
  },
});
