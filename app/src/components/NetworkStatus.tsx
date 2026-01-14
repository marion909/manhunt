import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGameStore } from '../store/game.store';

export default function NetworkStatus() {
  const isConnected = useGameStore((state) => state.isConnected);

  return (
    <View style={styles.container}>
      <Text style={[styles.text, !isConnected && styles.disconnected]}>
        {isConnected ? '🟢 WS' : '🔴 WS'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: '#111',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  text: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disconnected: {
    color: '#ff0000',
  },
});
