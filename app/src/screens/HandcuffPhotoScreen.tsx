import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiService } from '../services/api.service';

interface HandcuffPhotoScreenProps {
  captureId: string;
  playerName: string;
  onComplete: () => void;
  onCancel: () => void;
}

export default function HandcuffPhotoScreen({ 
  captureId, 
  playerName, 
  onComplete, 
  onCancel 
}: HandcuffPhotoScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const takePhoto = async () => {
    if (!cameraRef.current) return;

    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      
      if (result?.uri) {
        setPhoto(result.uri);
      }
    } catch (error) {
      console.error('[HandcuffPhoto] Failed to take photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
  };

  const confirmPhoto = async () => {
    if (!photo) return;

    setIsUploading(true);
    
    try {
      // Upload handcuff photo and confirm capture
      const result = await apiService.confirmCaptureWithHandcuff(captureId, photo);
      
      if (result.success) {
        Alert.alert(
          '✅ Capture Confirmed!',
          `${playerName} has been captured successfully!`,
          [{ text: 'OK', onPress: onComplete }]
        );
      } else {
        Alert.alert('Error', result.message || 'Failed to confirm capture');
      }
    } catch (error) {
      console.error('[HandcuffPhoto] Upload failed:', error);
      Alert.alert('Error', 'Failed to upload photo');
    } finally {
      setIsUploading(false);
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
        <Text style={styles.text}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} disabled={isUploading}>
          <Text style={[styles.backButton, isUploading && styles.disabled]}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>HANDCUFF PHOTO</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Player Info */}
      <View style={styles.playerInfo}>
        <Text style={styles.playerLabel}>Capturing:</Text>
        <Text style={styles.playerName}>{playerName}</Text>
      </View>

      {/* Camera or Preview */}
      <View style={styles.cameraContainer}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.preview} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          />
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionIcon}>🔗</Text>
        <Text style={styles.instructionText}>
          Take a photo of the handcuffs on the player to confirm the capture
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {photo ? (
          <>
            <TouchableOpacity 
              style={styles.retakeButton} 
              onPress={retakePhoto}
              disabled={isUploading}
            >
              <Text style={styles.retakeButtonText}>📷 Retake</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.confirmButton, isUploading && styles.buttonDisabled]} 
              onPress={confirmPhoto}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.confirmButtonText}>✅ Confirm Capture</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  backButton: {
    color: '#888',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  title: {
    color: '#ff0000',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 200,
  },
  playerInfo: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  playerLabel: {
    color: '#888',
    fontSize: 14,
  },
  playerName: {
    color: '#ff0000',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 5,
  },
  cameraContainer: {
    flex: 1,
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
  },
  camera: {
    flex: 1,
  },
  preview: {
    flex: 1,
    resizeMode: 'cover',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    padding: 15,
    marginHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ff0000',
  },
  instructionIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 15,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ff0000',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff0000',
  },
  retakeButton: {
    backgroundColor: '#333',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#666',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#00ff00',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    minWidth: 180,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
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
});
