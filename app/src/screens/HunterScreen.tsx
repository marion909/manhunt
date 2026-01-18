import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, StatusBar, ActivityIndicator, TouchableOpacity, ScrollView, Modal } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { websocketService } from '../services/websocket.service';
import { pingService } from '../services/ping.service';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';
import { apiService } from '../services/api.service';
import PanicButton from '../components/PanicButton';
import BatteryIndicator from '../components/BatteryIndicator';
import SpeedhuntStatusPanel from '../components/SpeedhuntStatusPanel';

interface GameInfo {
  id: string;
  name: string;
  status: string;
  startTime?: string;
}

interface GameBoundary {
  id: string;
  name: string;
  type: string;
  geometry: any;
  active: boolean;
}

interface HunterPosition {
  participantId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface PlayerPing {
  id: string;
  participantId: string;
  playerName: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  role?: string;
}

interface Player {
  id: string;
  displayName: string;
  status: string;
}

// Time filter options - 'live' means only last ping per player, numbers are minutes
const TIME_FILTERS: { label: string; value: 'live' | number }[] = [
  { label: 'Live', value: 'live' },
  { label: '15m', value: 15 },
  { label: '1h', value: 60 },
  { label: '6h', value: 360 },
  { label: '24h', value: 1440 },
];

export default function HunterScreen() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mapRef = useRef<MapView>(null);
  const { gameId, participantId } = useAuthStore();
  const isConnected = useGameStore((state) => state.isConnected);
  const setGame = useGameStore((state) => state.setGame);
  
  const [isLoading, setIsLoading] = useState(true);
  const [boundaries, setBoundaries] = useState<GameBoundary[]>([]);
  const [centerPoint, setCenterPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [hunterPositions, setHunterPositions] = useState<HunterPosition[]>([]);
  const [playerPings, setPlayerPings] = useState<PlayerPing[]>([]);
  const [gameInfoData, setGameInfoData] = useState<GameInfo | null>(null);
  
  // Filter state
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [pingTimeFilter, setPingTimeFilter] = useState<'live' | number>('live'); // 'live' = only last ping per player
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Active speedhunt state (for auto-filtering)
  const [activeSpeedhunt, setActiveSpeedhunt] = useState<{
    targetParticipantId: string;
    startedAt: string;
  } | null>(null);

  // Fetch game status
  const fetchGameStatus = useCallback(async () => {
    if (!gameId) return;
    try {
      const info = await apiService.getGameInfo(gameId);
      if (info) {
        setGameInfoData(info);
        // Update global store so TabNavigator can access status
        setGame(info as any);
      }
    } catch (err) {
      console.error('[HunterScreen] Failed to fetch game status:', err);
    }
  }, [gameId, setGame]);

  // Fetch players list
  const fetchPlayers = useCallback(async () => {
    if (!gameId) return;
    try {
      const playersList = await apiService.getPlayersForHunterFilters(gameId);
      setPlayers(playersList);
    } catch (err) {
      console.error('[HunterScreen] Failed to fetch players:', err);
    }
  }, [gameId]);

  // Fetch game info (center + boundaries)
  const fetchGameInfo = useCallback(async () => {
    if (!gameId || !participantId) return;
    
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
      console.error('[HunterScreen] Failed to fetch game info:', err);
    } finally {
      setIsLoading(false);
    }
  }, [gameId, participantId]);

  // Fetch hunter positions
  const fetchHunterPositions = useCallback(async () => {
    if (!gameId) return;
    
    try {
      const positions = await apiService.getHunterPositions(gameId);
      setHunterPositions(positions);
    } catch (err) {
      console.error('[HunterScreen] Failed to fetch hunter positions:', err);
    }
  }, [gameId]);

  // Fetch player pings with filters
  const fetchPlayerPings = useCallback(async () => {
    if (!gameId) return;
    
    try {
      // Determine filter parameters
      let playerIds: string[] | undefined;
      let sinceMinutes: number;
      let onlyLatest = false;
      
      if (activeSpeedhunt) {
        // Speedhunt active: filter for target only, fetch since start
        playerIds = [activeSpeedhunt.targetParticipantId];
        const startedAtMs = new Date(activeSpeedhunt.startedAt).getTime();
        sinceMinutes = Math.ceil((Date.now() - startedAtMs) / (60 * 1000));
        console.log('[HunterScreen] Speedhunt active, filtering for target:', activeSpeedhunt.targetParticipantId);
      } else if (pingTimeFilter === 'live') {
        // Live mode: fetch last 24h but only keep latest per player
        playerIds = selectedPlayerIds.length > 0 ? selectedPlayerIds : undefined;
        sinceMinutes = 1440;
        onlyLatest = true;
      } else {
        // Time-based filter
        playerIds = selectedPlayerIds.length > 0 ? selectedPlayerIds : undefined;
        sinceMinutes = pingTimeFilter;
      }
      
      let pings = await apiService.getPlayerPings(gameId, {
        playerIds,
        sinceMinutes,
        limit: 200,
      });
      
      console.log('[HunterScreen] Fetched pings:', pings.length, 'onlyLatest:', onlyLatest, 'activeSpeedhunt:', !!activeSpeedhunt);
      
      // In live mode, only keep the latest ping per player
      if (onlyLatest && !activeSpeedhunt) {
        const latestByPlayer = new Map<string, PlayerPing>();
        for (const ping of pings) {
          const playerId = ping.participantId;
          const existing = latestByPlayer.get(playerId);
          if (!existing || new Date(ping.createdAt) > new Date(existing.createdAt)) {
            latestByPlayer.set(playerId, ping);
          }
        }
        pings = Array.from(latestByPlayer.values());
        console.log('[HunterScreen] After live-mode filtering:', pings.length);
      }
      
      setPlayerPings(pings);
    } catch (err) {
      console.error('[HunterScreen] Failed to fetch pings:', err);
    }
  }, [gameId, selectedPlayerIds, pingTimeFilter, activeSpeedhunt]);

  // Toggle player selection
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  useEffect(() => {
    // Start ping service when game is active
    if (gameInfoData?.status?.toUpperCase() === 'ACTIVE') {
      console.log('[HunterScreen] Game is ACTIVE, starting ping service');
      pingService.start();
    } else {
      console.log('[HunterScreen] Game is not ACTIVE, stopping ping service');
      pingService.stop();
    }

    // Fetch game status, game info, players, hunter positions, and pings
    fetchGameStatus();
    fetchGameInfo();
    fetchPlayers();
    fetchHunterPositions();
    fetchPlayerPings();
    
    // Refresh game status every 5 seconds
    const statusInterval = setInterval(fetchGameStatus, 5000);
    
    // Refresh hunter positions and pings every 15 seconds
    const positionsInterval = setInterval(() => {
      fetchHunterPositions();
      fetchPlayerPings();
    }, 15000);

    // Cleanup
    return () => {
      pingService.stop();
      clearInterval(statusInterval);
      clearInterval(positionsInterval);
    };
  }, [fetchGameStatus, fetchGameInfo, fetchPlayers, fetchHunterPositions, fetchPlayerPings, gameInfoData?.status]);

  const handlePanic = () => {
    Alert.alert(
      'Panic Button',
      'Send emergency position?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: () => websocketService.sendPanic(),
        },
      ]
    );
  };

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
      case 'outer_boundary':
        return { fill: 'rgba(0, 255, 0, 0.1)', stroke: '#00ff00' };
      case 'FORBIDDEN':
      case 'forbidden_zone':
        return { fill: 'rgba(255, 0, 0, 0.2)', stroke: '#ff0000' };
      case 'INNER_ZONE':
      case 'inner_zone':
        return { fill: 'rgba(255, 165, 0, 0.1)', stroke: '#ffa500' };
      default:
        return { fill: 'rgba(100, 100, 100, 0.1)', stroke: '#666666' };
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      <View style={styles.header}>
        <Text style={styles.title}>HUNTER MODE</Text>
        <View style={styles.headerRight}>
          <View style={[styles.connectionDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
          <BatteryIndicator />
        </View>
      </View>

      {/* Speedhunt Status - compact mode */}
      {gameId && (
        <SpeedhuntStatusPanel 
          gameId={gameId} 
          compact 
          onSpeedhuntChange={setActiveSpeedhunt}
        />
      )}

      {/* Ping Filter Button */}
      <TouchableOpacity 
        style={styles.filterButton}
        onPress={() => setShowFilterModal(true)}
      >
        <Text style={styles.filterButtonText}>🔍 Ping Filter</Text>
        <View style={styles.filterBadge}>
          <Text style={styles.filterBadgeText}>{playerPings.length}</Text>
        </View>
        {activeSpeedhunt && (
          <View style={styles.speedhuntBadge}>
            <Text style={styles.speedhuntBadgeText}>⚡</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ping Filter</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Speedhunt Active Notice */}
            {activeSpeedhunt && (
              <View style={styles.speedhuntNotice}>
                <Text style={styles.speedhuntNoticeIcon}>⚡</Text>
                <View style={styles.speedhuntNoticeText}>
                  <Text style={styles.speedhuntNoticeTitle}>Speedhunt active</Text>
                  <Text style={styles.speedhuntNoticeDesc}>
                    Filter is automatically set to the target
                  </Text>
                </View>
              </View>
            )}

            {/* Time Filter */}
            <Text style={styles.filterLabel}>Mode</Text>
            <View style={styles.timeFilterRow}>
              {TIME_FILTERS.map((filter) => (
                <TouchableOpacity
                  key={String(filter.value)}
                  style={[
                    styles.timeFilterButton,
                    pingTimeFilter === filter.value && styles.timeFilterButtonActive,
                    filter.value === 'live' && pingTimeFilter === 'live' && styles.liveFilterActive,
                    activeSpeedhunt && styles.timeFilterButtonDisabled,
                  ]}
                  onPress={() => !activeSpeedhunt && setPingTimeFilter(filter.value)}
                  disabled={!!activeSpeedhunt}
                >
                  <Text style={[
                    styles.timeFilterText,
                    pingTimeFilter === filter.value && styles.timeFilterTextActive,
                  ]}>
                    {filter.value === 'live' ? '🔴 ' : ''}{filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.filterHint}>
              {pingTimeFilter === 'live' 
                ? 'Shows only the last ping per player'
                : `Shows all pings from the last ${typeof pingTimeFilter === 'number' ? (pingTimeFilter < 60 ? `${pingTimeFilter} min` : `${pingTimeFilter / 60} hrs`) : ''}`
              }
            </Text>

            {/* Player Filter */}
            <View style={styles.playerFilterHeader}>
              <Text style={styles.filterLabel}>Filter Players</Text>
              {selectedPlayerIds.length > 0 && (
                <TouchableOpacity onPress={() => setSelectedPlayerIds([])}>
                  <Text style={styles.clearFilterText}>Show All</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.playerList}>
              {players.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={styles.playerItem}
                  onPress={() => togglePlayerSelection(player.id)}
                >
                  <View style={[
                    styles.playerCheckbox,
                    (selectedPlayerIds.length === 0 || selectedPlayerIds.includes(player.id)) && styles.playerCheckboxActive,
                  ]}>
                    {(selectedPlayerIds.length === 0 || selectedPlayerIds.includes(player.id)) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.playerName}>{player.displayName}</Text>
                  <Text style={[
                    styles.playerStatus,
                    player.status === 'ACTIVE' ? styles.statusActive : styles.statusInactive,
                  ]}>
                    {player.status}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={styles.applyButton}
              onPress={() => {
                setShowFilterModal(false);
                fetchPlayerPings();
              }}
            >
              <Text style={styles.applyButtonText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Map */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff0000" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      ) : (
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

          {/* Other Hunter Markers */}
          {hunterPositions
            .filter(h => h.participantId !== participantId)
            .map((hunter) => (
            <Marker
              key={hunter.participantId}
              coordinate={{
                latitude: hunter.latitude,
                longitude: hunter.longitude,
              }}
              title={hunter.displayName}
              description={`Last seen: ${new Date(hunter.timestamp).toLocaleTimeString('en-US')}`}
            >
              <View style={styles.hunterMarker}>
                <Text style={styles.hunterMarkerText}>🎯</Text>
              </View>
            </Marker>
          ))}

          {/* Player Ping Markers */}
          {playerPings.map((ping) => {
            const isHunter = ping.role?.toUpperCase() === 'HUNTER';
            return (
              <Marker
                key={ping.id}
                coordinate={{
                  latitude: ping.latitude,
                  longitude: ping.longitude,
                }}
                title={ping.playerName}
                description={`Ping: ${new Date(ping.createdAt).toLocaleTimeString('en-US')}`}
              >
                <View style={[styles.pingMarker, isHunter ? styles.hunterPingMarker : styles.playerPingMarker]}>
                  <View style={styles.pingMarkerInner} />
                </View>
              </Marker>
            );
          })}
        </MapView>
      )}

      <PanicButton onPress={handlePanic} />
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotConnected: {
    backgroundColor: '#00ff00',
  },
  dotDisconnected: {
    backgroundColor: '#ff0000',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff0000',
    letterSpacing: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ff0000',
    fontSize: 16,
    marginTop: 16,
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
    fontSize: 28,
  },
  pingMarker: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  hunterPingMarker: {
    backgroundColor: '#ef4444', // red
  },
  playerPingMarker: {
    backgroundColor: '#3b82f6', // blue
  },
  pingMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  pingMarkerText: {
    fontSize: 28,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterBadge: {
    backgroundColor: '#0066ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalClose: {
    color: '#888',
    fontSize: 24,
  },
  filterLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 10,
  },
  timeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  timeFilterButton: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  timeFilterButtonActive: {
    backgroundColor: '#0066ff',
  },
  liveFilterActive: {
    backgroundColor: '#00aa00',
  },
  timeFilterButtonDisabled: {
    opacity: 0.5,
  },
  timeFilterText: {
    color: '#888',
    fontSize: 14,
  },
  timeFilterTextActive: {
    color: '#fff',
  },
  filterHint: {
    color: '#666',
    fontSize: 12,
    marginBottom: 20,
    marginTop: -10,
  },
  speedhuntBadge: {
    backgroundColor: '#ff6600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  speedhuntBadgeText: {
    fontSize: 12,
  },
  speedhuntNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 102, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 102, 0, 0.5)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  speedhuntNoticeIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  speedhuntNoticeText: {
    flex: 1,
  },
  speedhuntNoticeTitle: {
    color: '#ff9944',
    fontWeight: 'bold',
    fontSize: 14,
  },
  speedhuntNoticeDesc: {
    color: '#888',
    fontSize: 12,
  },
  playerFilterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clearFilterText: {
    color: '#0066ff',
    fontSize: 12,
  },
  playerList: {
    maxHeight: 200,
    marginBottom: 20,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  playerCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerCheckboxActive: {
    backgroundColor: '#0066ff',
    borderColor: '#0066ff',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerName: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  playerStatus: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: '#004400',
    color: '#00ff00',
  },
  statusInactive: {
    backgroundColor: '#440000',
    color: '#ff0000',
  },
  applyButton: {
    backgroundColor: '#0066ff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
