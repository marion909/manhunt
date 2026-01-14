import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface PanicButtonProps {
  onPress: () => void;
}

export default function PanicButton({ onPress }: PanicButtonProps) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.text}>🚨 PANIC</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: '#ff0000',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 50,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
