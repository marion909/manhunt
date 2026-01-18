import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

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
  geometry: any;
  active: boolean;
}

interface RouteParams {
  gameId: string;
}

export default function HunterMapScreen() {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const navigation = useNavigation();
  const { gameId } = route.params;
  const participantId = useAuthStore((state) => state.participantId);
  
  const mapRef = useRef<MapView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hunterPositions, setHunterPositions] = useState<HunterPosition[]>([]);
  const [boundaries, setBoundaries] = useState<GameBoundary[]>([]);
  const [centerPoint, setCenterPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch game info (center + boundaries)
  const fetchGameInfo = useCallback(async () => {
    try {
      const gameInfo = await apiService.getGameInfoForHunterMap(gameId);
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
      console.error('[HunterMap] Failed to fetch game info:', err);
    }
  }, [gameId]);

  const fetchHunterPositions = useCallback(async () => {
    try {
      const positions = await apiService.getHunterPositions(gameId);
      setHunterPositions(positions);
      setError(null);
    } catch (err) {
      console.error('[HunterMap] Failed to fetch positions:', err);
      setError('Error loading hunter positions');
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  const fetchStatus = useCallback(async () => {
    if (!participantId) return;
    
    try {
      const status = await apiService.getHunterAnfragenStatus(gameId, participantId);
      if (status) {
        setIsActive(status.isActive);
        if (status.expiresAt) {
          setExpiresAt(new Date(status.expiresAt));
        }
        
        // If no longer active, go back
        if (!status.isActive && status.usageCount > 0) {
          navigation.goBack();
        }
      }
    } catch (err) {
      console.error('[HunterMap] Failed to fetch status:', err);
    }
  }, [gameId, participantId, navigation]);

  // Initial load
  useEffect(() => {
    fetchGameInfo();
    fetchHunterPositions();
    fetchStatus();

    // Refresh positions every 10 seconds
    const positionsInterval = setInterval(fetchHunterPositions, 10000);
    // Check status every 30 seconds
    const statusInterval = setInterval(fetchStatus, 30000);

    return () => {
      clearInterval(positionsInterval);
      clearInterval(statusInterval);
    };
  }, [fetchGameInfo, fetchHunterPositions, fetchStatus]);

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
        navigation.goBack();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isActive, expiresAt, navigation]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6600" />
        <Text style={styles.loadingText}>Loading hunter positions...</Text>
      </View>
    );
  }

  // Helper to convert GeoJSON polygon to react-native-maps coordinates
  const getBoundaryCoordinates = (geometry: any) => {
    if (!geometry?.coordinates?.[0]) return [];
    return geometry.coordinates[0].map((coord: [number, number]) => ({
      latitude: coord[1],
      longitude: coord[0],
    }));
  };

  // Get boundary color based on type
  const getBoundaryColor = (type: string) => {
    switch (type) {
      case 'OUTER':
        return { fill: 'rgba(0, 255, 0, 0.15)', stroke: '#00ff00' };
      case 'FORBIDDEN':
        return { fill: 'rgba(255, 0, 0, 0.25)', stroke: '#ff0000' };
      default:
        return { fill: 'rgba(255, 165, 0, 0.2)', stroke: '#ffa500' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with countdown */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>🗺️ HUNTER MAP</Text>
          {timeRemaining ? (
            <Text style={styles.countdown}>⏱️ {timeRemaining}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.hunterCount}>
            {hunterPositions.length} Hunters
          </Text>
        </View>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: centerPoint?.latitude ?? 52.52,
          longitude: centerPoint?.longitude ?? 13.405,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        region={centerPoint ? {
          latitude: centerPoint.latitude,
          longitude: centerPoint.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        } : undefined}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {/* Game Boundaries */}
        {boundaries.filter(b => b.active).map((boundary) => {
          const colors = getBoundaryColor(boundary.type);
          const coordinates = getBoundaryCoordinates(boundary.geometry);
          if (coordinates.length === 0) return null;
          return (
            <Polygon
              key={boundary.id}
              coordinates={coordinates}
              fillColor={colors.fill}
              strokeColor={colors.stroke}
              strokeWidth={2}
            />
          );
        })}

        {/* Hunter Markers */}
        {hunterPositions.map((hunter) => (
          <Marker
            key={hunter.participantId}
            coordinate={{
              latitude: hunter.latitude,
              longitude: hunter.longitude,
            }}
            title={hunter.displayName}
            description={`Last seen: ${new Date(hunter.timestamp).toLocaleTimeString('en-US')}`}
            pinColor="#ff0000"
          >
            <View style={styles.hunterMarker}>
              <Text style={styles.hunterMarkerText}>🎯</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Error overlay */}
      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchHunterPositions}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* No hunters found */}
      {!error && hunterPositions.length === 0 && (
        <View style={styles.noHuntersOverlay}>
          <Text style={styles.noHuntersText}>No hunter positions available</Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Text style={styles.legendIcon}>🎯</Text>
          <Text style={styles.legendText}>Hunters</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendIcon}>📍</Text>
          <Text style={styles.legendText}>You</Text>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ff6600',
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#ff6600',
  },
  headerLeft: {
    flex: 1,
  },
  headerCenter: {
    flex: 2,
    alignItems: 'center',
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  backButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backButtonText: {
    color: '#ff6600',
    fontSize: 16,
  },
  title: {
    color: '#ff6600',
    fontSize: 18,
    fontWeight: 'bold',
  },
  countdown: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  hunterCount: {
    color: '#ff0000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  map: {
    flex: 1,
  },
  hunterMarker: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hunterMarkerText: {
    fontSize: 32,
  },
  errorOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#ff0000',
    fontWeight: 'bold',
  },
  noHuntersOverlay: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  noHuntersText: {
    color: '#ff6600',
    fontSize: 16,
  },
  legend: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIcon: {
    fontSize: 20,
  },
  legendText: {
    color: '#fff',
    fontSize: 14,
  },
});
