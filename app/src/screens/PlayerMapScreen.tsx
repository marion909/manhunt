import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, TextInput, StatusBar } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';

interface HunterPosition {
  participantId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface GameBoundary {
  id: string;
  name: string;
  type: string;
  boundaryType?: string;
  coordinates?: number[][];
  geometry?: any;
  active: boolean;
}

interface HunterAnfragenStatus {
  isAssigned: boolean;
  isActive: boolean;
  usageCount: number;
  expiresAt?: string;
}

interface FakePingStatus {
  isAssigned: boolean;
  used: boolean;
  usageCount: number;
}

export default function PlayerMapScreen() {
  const { gameId, participantId } = useAuthStore();
  const game = useGameStore((state) => state.game);
  
  const mapRef = useRef<MapView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [centerPoint, setCenterPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [boundaries, setBoundaries] = useState<GameBoundary[]>([]);
  
  // Hunter Anfragen (Hunter Orten) state
  const [hunterAnfragenStatus, setHunterAnfragenStatus] = useState<HunterAnfragenStatus | null>(null);
  const [hunterPositions, setHunterPositions] = useState<HunterPosition[]>([]);
  const [hunterAnfragenLoading, setHunterAnfragenLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  
  // Fake-Ping state
  const [fakePingStatus, setFakePingStatus] = useState<FakePingStatus | null>(null);
  const [fakePingLoading, setFakePingLoading] = useState(false);
  const [showFakePingPicker, setShowFakePingPicker] = useState(false);
  const [fakePingCoords, setFakePingCoords] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });

  // Fetch game info (center + boundaries)
  const fetchGameInfo = useCallback(async () => {
    if (!gameId) return;
    try {
      const gameInfo = await apiService.getGameInfoForPlayerMap(gameId);
      if (gameInfo) {
        if (gameInfo.centerPoint?.coordinates) {
          setCenterPoint({
            longitude: gameInfo.centerPoint.coordinates[0],
            latitude: gameInfo.centerPoint.coordinates[1],
          });
        }
        setBoundaries(gameInfo.boundaries || []);
      }
    } catch (err) {
      console.error('[PlayerMap] Failed to fetch game info:', err);
    }
  }, [gameId]);

  // Fetch joker statuses
  const fetchJokerStatuses = useCallback(async () => {
    if (!gameId || !participantId) return;
    
    try {
      // Fetch Hunter Anfragen status
      const hunterStatus = await apiService.getHunterAnfragenStatus(gameId, participantId);
      setHunterAnfragenStatus(hunterStatus);
      
      // If active, fetch hunter positions using player endpoint
      if (hunterStatus?.isActive) {
        const positions = await apiService.getHunterPositionsForPlayer(gameId);
        console.log('[PlayerMap] Hunter positions from status:', positions);
        setHunterPositions(positions);
      }

      // Fetch Fake-Ping status
      const fakePing = await apiService.getFakePingStatus(gameId, participantId);
      setFakePingStatus(fakePing);
    } catch (err) {
      console.error('[PlayerMap] Failed to fetch joker statuses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  // Get user location
  const fetchUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[PlayerMap] Location permission denied');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (err) {
      console.error('[PlayerMap] Failed to get location:', err);
    }
  }, []);

  // NOTE: Hunter positions are only loaded ONCE at activation time (Rulebook: "letzter Standort")
  // No automatic refresh - players only see the snapshot from activation moment

  // Initial load
  useEffect(() => {
    fetchGameInfo();
    fetchJokerStatuses();
    fetchUserLocation();

    // Refresh location every 10 seconds
    const locationInterval = setInterval(fetchUserLocation, 10000);
    // Refresh joker status every 30 seconds
    const statusInterval = setInterval(fetchJokerStatuses, 30000);

    return () => {
      clearInterval(locationInterval);
      clearInterval(statusInterval);
    };
  }, [fetchGameInfo, fetchJokerStatuses, fetchUserLocation]);

  // Refresh joker statuses when tab is focused
  useFocusEffect(
    useCallback(() => {
      console.log('[PlayerMap] Screen focused - refreshing joker statuses');
      fetchJokerStatuses();
    }, [fetchJokerStatuses])
  );

  // NOTE: No automatic refresh of hunter positions
  // Positions are loaded once at activation and remain static (last known location)

  // Countdown timer for Hunter Anfragen
  useEffect(() => {
    if (!hunterAnfragenStatus?.isActive || !hunterAnfragenStatus.expiresAt) {
      setTimeRemaining('');
      return;
    }

    const updateCountdown = () => {
      const expiresAt = new Date(hunterAnfragenStatus.expiresAt!).getTime();
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeRemaining('');
        setHunterAnfragenStatus(prev => prev ? { ...prev, isActive: false } : null);
        setHunterPositions([]);
        Alert.alert('⏰ Time expired', 'Hunter tracking has ended.');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [hunterAnfragenStatus?.isActive, hunterAnfragenStatus?.expiresAt]);

  // Activate Hunter Anfragen
  const handleActivateHunterAnfragen = () => {
    Alert.alert(
      '🔍 Track Hunters',
      'Are you sure? You can only see hunter positions ONCE per game for a limited time!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          style: 'destructive',
          onPress: async () => {
            if (!gameId || !participantId || hunterAnfragenLoading) return;
            
            setHunterAnfragenLoading(true);
            try {
              const result = await apiService.activateHunterAnfragen(gameId, participantId);
              if (result.success) {
                Alert.alert('✅ Activated!', 'You can now see hunter positions!');
                setHunterAnfragenStatus({
                  isAssigned: true,
                  isActive: true,
                  usageCount: 1,
                  expiresAt: result.expiresAt,
                });
                // Fetch initial positions using player endpoint
                const positions = await apiService.getHunterPositionsForPlayer(gameId);
                console.log('[PlayerMap] Initial hunter positions:', positions);
                setHunterPositions(positions);
              } else {
                Alert.alert('❌ Error', result.message || 'Could not activate hunter tracking');
              }
            } catch (error: any) {
              console.error('[PlayerMap] Activate Hunter Anfragen failed:', error);
              Alert.alert('❌ Error', error?.message || 'Network error');
            } finally {
              setHunterAnfragenLoading(false);
            }
          },
        },
      ]
    );
  };

  // Send Fake-Ping
  const handleSendFakePing = () => {
    const lat = parseFloat(fakePingCoords.lat);
    const lng = parseFloat(fakePingCoords.lng);

    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert('❌ Error', 'Please enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert('❌ Error', 'Coordinates outside valid range');
      return;
    }

    Alert.alert(
      '📍 Send Fake-Ping',
      `Position:\nLat: ${lat.toFixed(6)}\nLng: ${lng.toFixed(6)}\n\nThis can NOT be undone!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            if (!gameId || !participantId || fakePingLoading) return;
            
            setFakePingLoading(true);
            try {
              const result = await apiService.useFakePing(gameId, participantId, lat, lng);
              if (result.success) {
                Alert.alert('✅ Sent!', 'Hunters now see your fake location!');
                setFakePingStatus(prev => prev ? { ...prev, used: true, usageCount: 1 } : null);
                setShowFakePingPicker(false);
                setFakePingCoords({ lat: '', lng: '' });
              } else {
                Alert.alert('❌ Error', result.message || 'Could not send fake-ping');
              }
            } catch (error: any) {
              console.error('[PlayerMap] Send Fake-Ping failed:', error);
              Alert.alert('❌ Error', error?.message || 'Network error');
            } finally {
              setFakePingLoading(false);
            }
          },
        },
      ]
    );
  };

  // Use current location for fake ping
  const useCurrentLocationForFakePing = () => {
    if (userLocation) {
      // Offset slightly from real position
      const offsetLat = userLocation.latitude + (Math.random() - 0.5) * 0.01;
      const offsetLng = userLocation.longitude + (Math.random() - 0.5) * 0.01;
      setFakePingCoords({
        lat: offsetLat.toFixed(6),
        lng: offsetLng.toFixed(6),
      });
    }
  };

  // Convert boundary coordinates to polygon format
  const getBoundaryPolygon = (boundary: GameBoundary) => {
    if (boundary.coordinates && boundary.coordinates.length > 0) {
      return boundary.coordinates.map(coord => ({
        latitude: coord[1],
        longitude: coord[0],
      }));
    }
    if (boundary.geometry?.coordinates?.[0]) {
      return boundary.geometry.coordinates[0].map((coord: number[]) => ({
        latitude: coord[1],
        longitude: coord[0],
      }));
    }
    return [];
  };

  // Handle map press for Fake-Ping position
  const handleMapPress = (event: any) => {
    if (!showFakePingPicker) return;
    
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setFakePingCoords({
      lat: latitude.toFixed(6),
      lng: longitude.toFixed(6),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  const initialRegion = centerPoint || userLocation || { latitude: 50.1109, longitude: 8.6821 };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          ...initialRegion,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={true}
        showsMyLocationButton={true}
        onPress={handleMapPress}
      >
        {/* Game boundaries */}
        {boundaries.map((boundary, index) => {
          const polygon = getBoundaryPolygon(boundary);
          if (polygon.length === 0) return null;
          
          const isPlayArea = boundary.boundaryType === 'PLAY_AREA';
          const isSafeZone = boundary.boundaryType === 'SAFE_ZONE';
          
          return (
            <Polygon
              key={boundary.id || index}
              coordinates={polygon}
              fillColor={isSafeZone ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.15)'}
              strokeColor={isSafeZone ? '#22C55E' : '#3B82F6'}
              strokeWidth={3}
            />
          );
        })}

        {/* Hunter markers (when Hunter Anfragen is active) - shows LAST KNOWN position at activation */}
        {hunterAnfragenStatus?.isActive && hunterPositions.map((hunter, index) => (
          <Marker
            key={hunter.participantId || index}
            coordinate={{
              latitude: hunter.latitude,
              longitude: hunter.longitude,
            }}
            title={`🎯 HUNTER (last known position)`}
            description={hunter.displayName || 'Hunter'}
            pinColor="red"
          />
        ))}

        {/* Center point marker */}
        {centerPoint && (
          <Marker
            coordinate={centerPoint}
            title="Game Center"
            pinColor="blue"
          />
        )}

        {/* Fake-Ping preview marker */}
        {showFakePingPicker && fakePingCoords.lat && fakePingCoords.lng && (
          <Marker
            coordinate={{
              latitude: parseFloat(fakePingCoords.lat),
              longitude: parseFloat(fakePingCoords.lng),
            }}
            title="📍 Fake-Ping Position"
            description="Your fake location will appear here"
            pinColor="purple"
          />
        )}
      </MapView>

      {/* Header Overlay */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🗺️ PLAYER MAP</Text>
        {hunterAnfragenStatus?.isActive && timeRemaining && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>🔍 {timeRemaining}</Text>
          </View>
        )}
      </View>

      {/* Hunter count when active - show that these are LAST KNOWN positions */}
      {hunterAnfragenStatus?.isActive && hunterPositions.length > 0 && (
        <View style={styles.hunterCountBadge}>
          <Text style={styles.hunterCountText}>
            🎯 {hunterPositions.length} Hunters (last known position)
          </Text>
        </View>
      )}

      {/* Joker Buttons */}
      <View style={styles.jokerPanel}>
        <Text style={styles.jokerTitle}>🃏 Joker</Text>
        
        {/* Hunter Orten Button */}
        {hunterAnfragenStatus?.isAssigned && (
          <TouchableOpacity
            style={[
              styles.jokerButton,
              hunterAnfragenStatus.isActive ? styles.jokerButtonActive : null,
              (hunterAnfragenStatus.usageCount > 0 && !hunterAnfragenStatus.isActive) ? styles.jokerButtonUsed : null,
            ]}
            onPress={handleActivateHunterAnfragen}
            disabled={hunterAnfragenLoading || hunterAnfragenStatus.isActive || hunterAnfragenStatus.usageCount > 0}
          >
            {hunterAnfragenLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.jokerButtonIcon}>🔍</Text>
                <Text style={styles.jokerButtonText}>
                  {hunterAnfragenStatus.isActive 
                    ? `Active (${timeRemaining})` 
                    : hunterAnfragenStatus.usageCount > 0 
                      ? 'Used' 
                      : 'Track Hunters'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Fake-Ping Button */}
        {fakePingStatus?.isAssigned && (
          <>
            {!showFakePingPicker ? (
              <TouchableOpacity
                style={[
                  styles.jokerButton,
                  styles.jokerButtonPink,
                  (fakePingStatus.used || fakePingStatus.usageCount > 0) ? styles.jokerButtonUsed : null,
                ]}
                onPress={() => setShowFakePingPicker(true)}
                disabled={fakePingStatus.used || fakePingStatus.usageCount > 0}
              >
                <Text style={styles.jokerButtonIcon}>📍</Text>
                <Text style={styles.jokerButtonText}>
                  {(fakePingStatus.used || fakePingStatus.usageCount > 0) ? 'Used' : 'Fake-Ping'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.fakePingPicker}>
                <Text style={styles.fakePingTitle}>📍 Fake-Ping Position</Text>
                <Text style={styles.fakePingHint}>👆 Tap on map or:</Text>
                
                <TouchableOpacity style={styles.useLocationBtn} onPress={useCurrentLocationForFakePing}>
                  <Text style={styles.useLocationText}>📍 Random Position (±500m)</Text>
                </TouchableOpacity>
                
                <View style={styles.coordInputRow}>
                  <Text style={styles.coordLabel}>Lat:</Text>
                  <TextInput
                    style={styles.coordInput}
                    value={fakePingCoords.lat}
                    onChangeText={(text) => setFakePingCoords(prev => ({ ...prev, lat: text }))}
                    keyboardType="numeric"
                    placeholder="e.g. 50.1109"
                    placeholderTextColor="#666"
                  />
                </View>
                
                <View style={styles.coordInputRow}>
                  <Text style={styles.coordLabel}>Lng:</Text>
                  <TextInput
                    style={styles.coordInput}
                    value={fakePingCoords.lng}
                    onChangeText={(text) => setFakePingCoords(prev => ({ ...prev, lng: text }))}
                    keyboardType="numeric"
                    placeholder="e.g. 8.6821"
                    placeholderTextColor="#666"
                  />
                </View>
                
                <View style={styles.fakePingButtons}>
                  <TouchableOpacity
                    style={[styles.fakePingSendBtn, !fakePingCoords.lat || !fakePingCoords.lng ? styles.btnDisabled : null]}
                    onPress={handleSendFakePing}
                    disabled={!fakePingCoords.lat || !fakePingCoords.lng || fakePingLoading}
                  >
                    {fakePingLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.fakePingSendText}>Send</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.fakePingCancelBtn}
                    onPress={() => {
                      setShowFakePingPicker(false);
                      setFakePingCoords({ lat: '', lng: '' });
                    }}
                  >
                    <Text style={styles.fakePingCancelText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* No jokers message */}
        {!hunterAnfragenStatus?.isAssigned && !fakePingStatus?.isAssigned && (
          <Text style={styles.noJokersText}>No jokers assigned</Text>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Legend</Text>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Play Area</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.legendText}>Safe Zone</Text>
        </View>
        {hunterAnfragenStatus?.isActive && (
          <View style={styles.legendItem}>
            <Text style={styles.legendEmoji}>🎯</Text>
            <Text style={[styles.legendText, { color: '#EF4444' }]}>Hunter</Text>
          </View>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#00ff00',
    marginTop: 10,
    fontSize: 16,
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  headerTitle: {
    color: '#00ff00',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  timerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  hunterCountBadge: {
    position: 'absolute',
    top: 70,
    left: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hunterCountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jokerPanel: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    minWidth: 180,
  },
  jokerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  jokerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  jokerButtonActive: {
    backgroundColor: '#DC2626',
  },
  jokerButtonPink: {
    backgroundColor: '#DB2777',
  },
  jokerButtonUsed: {
    backgroundColor: '#4B5563',
    opacity: 0.6,
  },
  jokerButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  jokerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noJokersText: {
    color: '#6B7280',
    fontSize: 12,
  },
  fakePingPicker: {
    backgroundColor: 'rgba(219, 39, 119, 0.2)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DB2777',
  },
  fakePingTitle: {
    color: '#F472B6',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fakePingHint: {
    color: '#9CA3AF',
    fontSize: 11,
    marginBottom: 8,
  },
  useLocationBtn: {
    backgroundColor: '#DB2777',
    padding: 8,
    borderRadius: 5,
    marginBottom: 10,
    alignItems: 'center',
  },
  useLocationText: {
    color: '#fff',
    fontSize: 12,
  },
  coordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  coordLabel: {
    color: '#F472B6',
    fontSize: 12,
    width: 30,
  },
  coordInput: {
    flex: 1,
    backgroundColor: '#1F2937',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    fontSize: 12,
  },
  fakePingButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  fakePingSendBtn: {
    flex: 1,
    backgroundColor: '#DB2777',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  fakePingSendText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  fakePingCancelBtn: {
    backgroundColor: '#4B5563',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 5,
  },
  fakePingCancelText: {
    color: '#fff',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  legend: {
    position: 'absolute',
    bottom: 20,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  legendTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 6,
  },
  legendEmoji: {
    fontSize: 12,
    marginRight: 6,
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
});
