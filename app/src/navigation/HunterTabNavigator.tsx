import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Pressable } from 'react-native';

// Import screens
import HunterScreen from '../screens/HunterScreen';
import ChatScreen from '../screens/ChatScreen';
import VoiceScreen from '../screens/VoiceScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CaptureScreen from '../screens/CaptureScreen';
import WaitingOverlay from '../components/WaitingOverlay';
import { useGameStore } from '../store/game.store';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

const Tab = createBottomTabNavigator();

// Simple icon component (using emoji for simplicity - can be replaced with icons)
const TabIcon = ({ icon, focused, disabled }: { icon: string; focused: boolean; disabled?: boolean }) => (
  <View style={styles.iconContainer}>
    <Text style={[styles.icon, focused && styles.iconFocused, disabled && styles.iconDisabled]}>{icon}</Text>
  </View>
);

// Disabled tab button component
const DisabledTabButton = ({ children, style }: any) => (
  <View style={[style, { opacity: 0.4 }]} pointerEvents="none">
    {children}
  </View>
);

export function HunterTabNavigator() {
  const game = useGameStore((state) => state.game);
  const setGame = useGameStore((state) => state.setGame);
  const { gameId } = useAuthStore();
  const isGameActive = game?.status?.toLowerCase() === 'active';
  const [showOverlay, setShowOverlay] = useState(!isGameActive);
  const [currentTab, setCurrentTab] = useState('Map');

  // Fetch game status periodically
  useEffect(() => {
    const fetchGameStatus = async () => {
      if (!gameId) return;
      try {
        const info = await apiService.getGameInfo(gameId);
        if (info) {
          setGame(info as any);
        }
      } catch (err) {
        console.error('[HunterTabNavigator] Failed to fetch game status:', err);
      }
    };
    
    fetchGameStatus();
    const interval = setInterval(fetchGameStatus, 5000);
    return () => clearInterval(interval);
  }, [gameId, setGame]);

  // Show overlay when game becomes inactive
  useEffect(() => {
    if (!isGameActive) {
      setShowOverlay(true);
    } else {
      setShowOverlay(false);
    }
  }, [isGameActive]);

  // Custom Settings tab button that toggles overlay
  const SettingsTabButton = (props: any) => {
    const { onPress, ...rest } = props;
    return (
      <Pressable
        {...rest}
        onPress={(e) => {
          if (!isGameActive) {
            if (currentTab === 'Settings') {
              // Already on Settings, toggle overlay
              setShowOverlay(!showOverlay);
            } else {
              // Going to Settings, hide overlay
              setShowOverlay(false);
              setCurrentTab('Settings');
            }
          }
          onPress?.(e);
        }}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#EF4444',
          tabBarInactiveTintColor: '#6B7280',
          tabBarLabelStyle: styles.tabLabel,
        }}
        screenListeners={{
          tabPress: (e) => {
            const tabName = e.target?.split('-')[0] || '';
            if (tabName !== 'Settings') {
              setCurrentTab(tabName);
              if (!isGameActive) {
                setShowOverlay(true);
              }
            }
          },
        }}
      >
        <Tab.Screen
          name="Map"
          component={HunterScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon icon="🗺️" focused={focused} disabled={!isGameActive} />,
            tabBarLabel: 'Map',
            tabBarButton: isGameActive ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Capture"
          component={CaptureScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon icon="🎯" focused={focused} disabled={!isGameActive} />,
            tabBarLabel: 'Capture',
            tabBarButton: isGameActive ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon icon="💬" focused={focused} disabled={!isGameActive} />,
            tabBarLabel: 'Chat',
            tabBarButton: isGameActive ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Voice"
          component={VoiceScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon icon="🎤" focused={focused} disabled={!isGameActive} />,
            tabBarLabel: 'Voice',
            tabBarButton: isGameActive ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon icon="⚙️" focused={focused} />,
            tabBarLabel: 'Settings',
            tabBarButton: (props) => <SettingsTabButton {...props} />,
          }}
        />
      </Tab.Navigator>
      
      {/* Overlay on Navigator level */}
      {!isGameActive && showOverlay && game && (
        <View style={styles.overlayContainer}>
          <WaitingOverlay 
            gameName={game.name || 'Spiel'} 
            startTime={game.startTime} 
            status={game.status || 'draft'}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1F2937',
    borderTopColor: '#374151',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    height: 65,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    opacity: 0.6,
  },
  iconFocused: {
    opacity: 1,
  },
  iconDisabled: {
    opacity: 0.3,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 65, // Leave space for tab bar
    zIndex: 100,
  },
});
