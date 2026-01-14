import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';
import NetworkStatus from '../components/NetworkStatus';
import BatteryIndicator from '../components/BatteryIndicator';

export default function OrgaScreen() {
  const { participantId, gameId } = useAuthStore();
  const { isConnected, events, hunterPositions, playerPings } = useGameStore();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ORGA DASHBOARD</Text>
        <NetworkStatus />
        <BatteryIndicator />
      </View>

      <View style={styles.stats}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{hunterPositions.size}</Text>
          <Text style={styles.statLabel}>Hunters</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{playerPings.length}</Text>
          <Text style={styles.statLabel}>Player Pings</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{events.length}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Log</Text>
        <ScrollView style={styles.eventLog}>
          {events.length === 0 ? (
            <Text style={styles.noEvents}>No events yet</Text>
          ) : (
            events.map((event) => (
              <View key={event.id} style={styles.eventItem}>
                <Text style={styles.eventType}>{event.type}</Text>
                <Text style={styles.eventMessage}>{event.message}</Text>
                <Text style={styles.eventTime}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>Map with all positions</Text>
        <Text style={styles.mapSubtext}>
          Shows hunters + player pings
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Text>
        <Text style={styles.participantId}>ID: {participantId}</Text>
        {gameId && <Text style={styles.gameId}>Game: {gameId}</Text>}
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0088ff',
    letterSpacing: 2,
  },
  stats: {
    flexDirection: 'row',
    padding: 20,
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0088ff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
  section: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  eventLog: {
    flex: 1,
  },
  noEvents: {
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  eventItem: {
    backgroundColor: '#111',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0088ff',
  },
  eventType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0088ff',
  },
  eventMessage: {
    fontSize: 14,
    color: '#fff',
    marginTop: 5,
  },
  eventTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  mapPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    margin: 20,
    borderRadius: 10,
  },
  mapText: {
    fontSize: 18,
    color: '#666',
  },
  mapSubtext: {
    fontSize: 14,
    color: '#444',
    marginTop: 10,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    color: '#0f0',
  },
  participantId: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
  gameId: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
});
