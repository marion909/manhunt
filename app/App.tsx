import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { BackHandler, Alert } from 'react-native';
import { useAuthStore } from './src/store/auth.store';
import { locationService } from './src/services/location.service';
import { websocketService } from './src/services/websocket.service';
import { chatService } from './src/services/chat.service';
import { voiceService } from './src/services/voice.service';
import { queueService } from './src/services/queue.service';

// Screens
import SplashScreen from './src/screens/SplashScreen';
import QRScanScreen from './src/screens/QRScanScreen';

// Tab Navigators
import { HunterTabNavigator } from './src/navigation/HunterTabNavigator';
import { PlayerTabNavigator } from './src/navigation/PlayerTabNavigator';
import { OrgaTabNavigator } from './src/navigation/OrgaTabNavigator';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadAuth = useAuthStore((state) => state.loadAuth);
  const hostname = useAuthStore((state) => state.hostname);
  const participantId = useAuthStore((state) => state.participantId);
  const role = useAuthStore((state) => state.role);

  useEffect(() => {
    // Disable back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Prevent back action
    });

    // Initialize app
    initializeApp();

    return () => {
      backHandler.remove();
      websocketService.disconnect();
      chatService.disconnect();
      voiceService.disconnect();
      locationService.stopWatching();
    };
  }, []);

  useEffect(() => {
    // Connect to WebSocket and start tracking when authenticated
    if (isAuthenticated && hostname && participantId) {
      connectAndStart();
    }
  }, [isAuthenticated, hostname, participantId]);

  const initializeApp = async () => {
    try {
      // Load stored auth
      console.log('initializeApp: Loading stored auth...');
      await loadAuth();
      console.log('initializeApp: Auth loaded');

      // Load offline queue
      await queueService.loadQueue();

      // Show splash for 3 seconds
      setTimeout(() => {
        console.log('initializeApp: Setting isLoading to false');
        setIsLoading(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to initialize app:', error);
      Alert.alert('Initialization Error', 'Failed to start app');
      setIsLoading(false);
    }
  };

  const connectAndStart = async () => {
    try {
      // Initialize location service
      const locationInitialized = await locationService.initialize();
      if (!locationInitialized) {
        Alert.alert(
          'Permission Required',
          'Location permission is required for this app to work'
        );
        return;
      }

      // Connect to WebSocket
      websocketService.connect(hostname);
      
      // Connect chat and voice services
      chatService.connect(hostname);
      voiceService.connect(hostname);

      // Wait a bit for connection to establish
      setTimeout(() => {
        // Join game if we have gameId
        const gameId = useAuthStore.getState().gameId;
        if (gameId) {
          websocketService.joinGame(gameId, participantId);
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to connect and start:', error);
      Alert.alert('Connection Error', 'Failed to connect to server');
    }
  };

  const getRoleScreen = () => {
    switch (role) {
      case 'HUNTER':
        return 'Hunter';
      case 'PLAYER':
        return 'Player';
      case 'ORGA':
      case 'OPERATOR':
        return 'Orga';
      default:
        return 'Player';
    }
  };

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
          }}
        >
          {console.log('Navigation: isLoading=', isLoading, 'isAuthenticated=', isAuthenticated, 'role=', role)}
          {isLoading ? (
            <Stack.Screen name="Splash" component={SplashScreen} />
          ) : !isAuthenticated ? (
            <Stack.Screen name="QRScan">
              {(props) => (
                <QRScanScreen
                  {...props}
                  onScanComplete={() => {
                    console.log('QRScanScreen callback triggered - navigating to next screen');
                    // Navigate to correct screen based on role
                    const currentRole = useAuthStore.getState().role;
                    let targetScreen = 'Player';
                    if (currentRole === 'HUNTER') {
                      targetScreen = 'Hunter';
                    } else if (currentRole === 'ORGA' || currentRole === 'OPERATOR') {
                      targetScreen = 'Orga';
                    }
                    console.log('Navigating to:', targetScreen, 'based on role:', currentRole);
                    props.navigation.reset({
                      index: 0,
                      routes: [{ name: targetScreen }],
                    });
                  }}
                />
              )}
            </Stack.Screen>
          ) : role === 'HUNTER' ? (
            <Stack.Screen name="Hunter" component={HunterTabNavigator} />
          ) : role === 'ORGA' || role === 'OPERATOR' ? (
            <Stack.Screen name="Orga" component={OrgaTabNavigator} />
          ) : (
            <Stack.Screen name="Player" component={PlayerTabNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
