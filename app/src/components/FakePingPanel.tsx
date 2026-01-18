import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

interface FakePingPanelProps {
  gameId: string;
}

export default function FakePingPanel({ gameId }: FakePingPanelProps) {
  const participantId = useAuthStore((state) => state.participantId);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAssigned, setIsAssigned] = useState(false);
  const [isUsed, setIsUsed] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [fakeLatitude, setFakeLatitude] = useState('');
  const [fakeLongitude, setFakeLongitude] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!participantId) return;
    
    try {
      const status = await apiService.getFakePingStatus(gameId, participantId);
      if (status) {
        setIsAssigned(status.isAssigned);
        setIsUsed(status.usageCount > 0);
      }
    } catch (error) {
      console.error('[FakePing] Failed to fetch status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleShowPicker = () => {
    setShowLocationPicker(true);
  };

  const handleSendFakePing = async () => {
    if (!participantId) return;

    const lat = parseFloat(fakeLatitude);
    const lng = parseFloat(fakeLongitude);

    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert('Error', 'Please enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert('Error', 'Coordinates outside valid range');
      return;
    }

    Alert.alert(
      'Send Fake-Ping',
      `Fake-Position:\nLat: ${lat.toFixed(6)}\nLng: ${lng.toFixed(6)}\n\nThis cannot be undone!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setIsSending(true);
            try {
              const result = await apiService.useFakePing(gameId, participantId, lat, lng);
              if (result.success) {
                setIsUsed(true);
                setShowLocationPicker(false);
                Alert.alert('✅ Fake-Ping sent!', 'The hunters now see your fake location.');
              } else {
                Alert.alert('Error', result.message || 'Fake-Ping could not be sent');
              }
            } catch (error) {
              console.error('[FakePing] Send failed:', error);
              Alert.alert('Error', 'Network error while sending');
            } finally {
              setIsSending(false);
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
        <ActivityIndicator size="small" color="#ff00ff" />
      </View>
    );
  }

  // Already used
  if (isUsed) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.icon}>📍</Text>
          <Text style={styles.title}>Fake-Ping</Text>
        </View>
        <Text style={styles.usedText}>Already used</Text>
      </View>
    );
  }

  // Location picker
  if (showLocationPicker) {
    return (
      <View style={[styles.container, styles.pickerContainer]}>
        <View style={styles.header}>
          <Text style={styles.icon}>📍</Text>
          <Text style={styles.title}>Fake-Ping Position</Text>
        </View>
        
        <Text style={styles.pickerHint}>
          Enter the coordinates for your fake location:
        </Text>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Latitude:</Text>
          <TextInput
            style={styles.input}
            value={fakeLatitude}
            onChangeText={setFakeLatitude}
            placeholder="z.B. 48.2082"
            placeholderTextColor="#666"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Longitude:</Text>
          <TextInput
            style={styles.input}
            value={fakeLongitude}
            onChangeText={setFakeLongitude}
            placeholder="z.B. 16.3738"
            placeholderTextColor="#666"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowLocationPicker(false)}
            disabled={isSending}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.sendButton, isSending && styles.buttonDisabled]}
            onPress={handleSendFakePing}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Available to use
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>📍</Text>
        <Text style={styles.title}>Fake-Ping</Text>
      </View>
      <Text style={styles.description}>
        Send a fake location to the hunters once. Cannot be undone!
      </Text>
      <TouchableOpacity
        style={styles.activateButton}
        onPress={handleShowPicker}
      >
        <Text style={styles.activateButtonText}>Choose Position</Text>
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
  pickerContainer: {
    borderColor: '#ff00ff',
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
  pickerHint: {
    color: '#888',
    fontSize: 14,
    marginBottom: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  inputLabel: {
    color: '#888',
    fontSize: 14,
    width: 80,
  },
  input: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#ff00ff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  activateButton: {
    backgroundColor: '#ff00ff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  activateButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
