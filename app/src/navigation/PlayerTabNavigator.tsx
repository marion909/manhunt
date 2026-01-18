import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Pressable } from 'react-native';

// Import screens
import PlayerScreen from '../screens/PlayerScreen';
import PlayerMapScreen from '../screens/PlayerMapScreen';
import ChatScreen from '../screens/ChatScreen';
import VoiceScreen from '../screens/VoiceScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WaitingOverlay from '../components/WaitingOverlay';
import CapturedOverlay from '../components/CapturedOverlay';
import { useGameStore } from '../store/game.store';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';

const Tab = createBottomTabNavigator();

// Simple icon component
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

export function PlayerTabNavigator() {
  const game = useGameStore((state) => state.game);
  const setGame = useGameStore((state) => state.setGame);
  const { gameId, participantId, participantStatus, setParticipantStatus } = useAuthStore();
  const isGameActive = game?.status?.toLowerCase() === 'active';
  const isCaptured = participantStatus?.toUpperCase() === 'CAPTURED';
  const [showWaitingOverlay, setShowWaitingOverlay] = useState(!isGameActive);
  const [showCapturedOverlay, setShowCapturedOverlay] = useState(isCaptured);
  const [currentTab, setCurrentTab] = useState('Home');

  // Fetch game status and participant status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      if (!gameId) return;
      try {
        const info = await apiService.getGameInfo(gameId);
        if (info) {
          setGame(info as any);
        }
        
        // Fetch participant status if we have participantId
        if (participantId) {
          console.log('[PlayerTabNavigator] Fetching participant status for:', participantId);
          const participant = await apiService.getParticipantStatus(gameId, participantId);
          console.log('[PlayerTabNavigator] Got participant status:', participant);
          if (participant?.status) {
            console.log('[PlayerTabNavigator] Setting status to:', participant.status);
            setParticipantStatus(participant.status as 'ACTIVE' | 'CAPTURED' | 'DISQUALIFIED');
          }
        }
      } catch (err) {
        console.error('[PlayerTabNavigator] Failed to fetch status:', err);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [gameId, participantId, setGame, setParticipantStatus]);

  // Show waiting overlay when game becomes inactive
  useEffect(() => {
    console.log('[PlayerTabNavigator] isGameActive:', isGameActive, 'isCaptured:', isCaptured);
    if (!isGameActive && !isCaptured) {
      setShowWaitingOverlay(true);
    } else {
      setShowWaitingOverlay(false);
    }
  }, [isGameActive, isCaptured]);

  // Show captured overlay when player is captured
  useEffect(() => {
    console.log('[PlayerTabNavigator] Captured effect - isCaptured:', isCaptured, 'participantStatus:', participantStatus);
    if (isCaptured) {
      console.log('[PlayerTabNavigator] SHOWING CAPTURED OVERLAY');
      setShowCapturedOverlay(true);
    } else {
      setShowCapturedOverlay(false);
    }
  }, [isCaptured, participantStatus]);

  // Custom Settings tab button that toggles overlay
  const SettingsTabButton = (props: any) => {
    const { onPress, ...rest } = props;
    return (
      <Pressable
        {...rest}
        onPress={(e) => {
          // Hide captured overlay when going to Settings
          if (isCaptured) {
            setShowCapturedOverlay(false);
          }
          if (!isGameActive && !isCaptured) {
            if (currentTab === 'Settings') {
              // Already on Settings, toggle overlay
              setShowWaitingOverlay(!showWaitingOverlay);
            } else {
              // Going to Settings, hide overlay
              setShowWaitingOverlay(false);
              setCurrentTab('Settings');
            }
          }
          onPress?.(e);
        }}
      />
    );
  };

  // Check if a tab should be disabled when captured
  const isTabDisabledWhenCaptured = (tabName: string) => {
    if (!isCaptured) return false;
    // Only allow Chat, Voice, and Settings when captured (not Home or Map)
    return tabName !== 'Chat' && tabName !== 'Voice' && tabName !== 'Settings';
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: isCaptured ? '#6B7280' : '#22C55E',
          tabBarInactiveTintColor: '#6B7280',
          tabBarLabelStyle: styles.tabLabel,
        }}
        screenListeners={{
          tabPress: (e) => {
            const tabName = e.target?.split('-')[0] || '';
            
            // When captured, show overlay when navigating to disabled tabs
            if (isCaptured && isTabDisabledWhenCaptured(tabName)) {
              setShowCapturedOverlay(true);
              e.preventDefault();
              return;
            }
            
            if (tabName !== 'Settings') {
              setCurrentTab(tabName);
              if (!isGameActive && !isCaptured) {
                setShowWaitingOverlay(true);
              }
            }
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={PlayerScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => (
              <TabIcon icon="🏃" focused={focused} disabled={!isGameActive || isCaptured} />
            ),
            tabBarLabel: 'Status',
            tabBarButton: (isGameActive && !isCaptured) ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Map"
          component={PlayerMapScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => (
              <TabIcon icon="🗺️" focused={focused} disabled={!isGameActive || isCaptured} />
            ),
            tabBarLabel: 'Map',
            tabBarButton: (isGameActive && !isCaptured) ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => (
              <TabIcon icon="💬" focused={focused} disabled={!isGameActive && !isCaptured} />
            ),
            tabBarLabel: 'Chat',
            // Chat is allowed when captured (for Orga chat)
            tabBarButton: (isGameActive || isCaptured) ? undefined : (props) => <DisabledTabButton {...props} />,
          }}
        />
        <Tab.Screen
          name="Voice"
          component={VoiceScreen}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => (
              <TabIcon icon="🎤" focused={focused} disabled={!isGameActive && !isCaptured} />
            ),
            tabBarLabel: 'Voice',
            // Voice is allowed when captured (for Orga voice)
            tabBarButton: (isGameActive || isCaptured) ? undefined : (props) => <DisabledTabButton {...props} />,
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
      
      {/* Waiting Overlay when game not active */}
      {!isGameActive && !isCaptured && showWaitingOverlay && game && (
        <View style={styles.overlayContainer}>
          <WaitingOverlay 
            gameName={game.name || 'Spiel'} 
            startTime={game.startTime} 
            status={game.status || 'draft'}
          />
        </View>
      )}
      
      {/* Captured Overlay when player is captured */}
      {isCaptured && showCapturedOverlay && (
        <View style={styles.overlayContainer}>
          <CapturedOverlay />
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
