import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CapturedOverlay() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Handcuff Icon */}
        <Text style={styles.icon}>🔗</Text>
        
        {/* Main Message */}
        <Text style={styles.title}>YOU WERE CAUGHT!</Text>
        
        <View style={styles.divider} />
        
        <Text style={styles.subtitle}>
          You are eliminated from the game.
        </Text>
        
        <Text style={styles.description}>
          You can still use Orga-Chat and Orga-Voice, 
          as well as adjust your settings.
        </Text>

        {/* Available Features */}
        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle}>Available:</Text>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>💬</Text>
            <Text style={styles.featureText}>Orga Chat</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>🎤</Text>
            <Text style={styles.featureText}>Orga Voice</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>⚙️</Text>
            <Text style={styles.featureText}>Settings</Text>
          </View>
        </View>

        {/* Disabled Features Notice */}
        <View style={styles.disabledContainer}>
          <Text style={styles.disabledTitle}>Disabled:</Text>
          <Text style={styles.disabledText}>
            Pings • Jokes • QR-Code • Status
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    padding: 30,
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  icon: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ff0000',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 10,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: '#ff0000',
    marginVertical: 15,
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: '#aaaaaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  featuresContainer: {
    width: '100%',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  featuresTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#22C55E',
    marginBottom: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#ffffff',
  },
  disabledContainer: {
    width: '100%',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  disabledTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: 5,
  },
  disabledText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
