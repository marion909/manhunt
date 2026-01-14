import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Button } from 'react-native';
import { CameraView, useCameraPermissions, BarCodeScanner } from 'expo-camera';
import { useAuthStore } from '../store/auth.store';
import { QRData } from '../types';

interface QRScanScreenProps {
  onScanComplete: () => void;
}

export default function QRScanScreen({ onScanComplete }: QRScanScreenProps) {
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async (scanningResult: any) => {
    console.log('handleBarCodeScanned called with:', scanningResult);
    if (scanned) {
      console.log('Already scanned, returning');
      return;
    }
    
    const { type, data } = scanningResult;
    console.log('Scanned QR:', { type, data });
    console.log('Type value:', type);
    
    // Check if it's a QR code - just compare the string directly
    if (type !== 'qr') {
      console.log('Type check failed, not a QR code:', type, '!==', 'qr');
      return;
    }
    
    console.log('Type check passed, continuing...');
    console.log('Setting scanned to true');
    setScanned(true);

    try {
      console.log('Parsing QR data...');
      let parsedData: QRData;

      // Try JSON format first
      try {
        console.log('Trying JSON parse...');
        parsedData = JSON.parse(data);
        console.log('JSON parse successful');
      } catch (e) {
        console.log('JSON parse failed, trying pipe format...');
        // Try pipe-separated format: hostname|gameId|participantId|name|role
        const parts = data.split('|');
        console.log('Split parts:', parts, 'length:', parts.length);
        
        if (parts.length !== 5) {
          throw new Error(`Invalid QR code format - expected 5 parts, got ${parts.length}`);
        }
        parsedData = {
          hostname: parts[0],
          gameId: parts[1],
          participantId: parts[2],
          name: parts[3],
          role: (parts[4].toUpperCase() as any),
        };
        console.log('Pipe format parsed successfully');
      }

      console.log('Final parsed data:', parsedData);

      // Validate QR data
      if (!parsedData.hostname || !parsedData.gameId || !parsedData.participantId || !parsedData.role) {
        throw new Error('Missing required QR data fields');
      }

      // Save to auth store
      console.log('About to call setAuth with:', parsedData);
      await setAuth({
        hostname: parsedData.hostname,
        participantId: parsedData.participantId,
        name: parsedData.name,
        role: parsedData.role,
        gameId: parsedData.gameId,
      });
      console.log('setAuth completed');

      // Check store after save
      const state = useAuthStore.getState();
      console.log('Auth store state after setAuth:', state);

      // Navigate immediately
      console.log('About to call onScanComplete');
      onScanComplete();
      console.log('onScanComplete called');
    } catch (error) {
      console.error('Failed to parse QR code:', error);
      setScanned(false);
      Alert.alert('Invalid QR Code', 'Error: ' + String(error));
    }
  };

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
        <Text style={styles.text}>Camera permission denied</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
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
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        <Text style={styles.instructions}>
          Scan MANHUNT QR Code to start
        </Text>
        {scanned && (
          <Button title="Scan Again" onPress={() => setScanned(false)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  text: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 200,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#00ff00',
    backgroundColor: 'transparent',
    borderRadius: 10,
  },
  instructions: {
    color: '#fff',
    fontSize: 18,
    marginTop: 30,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
