import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Battery from 'expo-battery';

export default function BatteryIndicator() {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryState, setBatteryState] = useState<Battery.BatteryState | null>(null);

  useEffect(() => {
    let subscription: any;

    const init = async () => {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      setBatteryLevel(level);
      setBatteryState(state);

      subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        setBatteryLevel(batteryLevel);
      });
    };

    init();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  if (batteryLevel === null) {
    return null;
  }

  const percentage = Math.round(batteryLevel * 100);
  const isCharging = batteryState === Battery.BatteryState.CHARGING;
  const isLow = percentage < 20;

  return (
    <View style={styles.container}>
      <Text style={[styles.text, isLow && styles.lowBattery]}>
        {isCharging ? '⚡' : '🔋'} {percentage}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  text: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  lowBattery: {
    color: '#ff0000',
  },
});
