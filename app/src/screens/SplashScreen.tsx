import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MANHUNT</Text>
      <Text style={styles.subtitle}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ff0000',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 20,
  },
});
