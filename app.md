# MANHUNT - React Native Android App Documentation

## 📋 Project Overview

**Purpose:** Custom Android Launcher App für GPS-basiertes Manhunt Game  
**Server:** `http://192.168.0.100:3000`  
**WebSocket:** `ws://192.168.0.100:3000`  
**Platform:** React Native (Expo) - Android Only  
**Mode:** Kiosk/Launcher Mode (cannot be closed)

---

## 🎯 Core Requirements

### App Behavior
- ✅ **Android Launcher** - App acts as device launcher (cannot exit)
- ✅ **QR Code Entry** - Login via QR scan only
- ✅ **Persistent GPS** - Location tracking always active (highest accuracy)
- ✅ **WebSocket Only** - All position updates via WebSocket (no REST fallback)
- ✅ **Role-Based UI** - Different behavior for Hunter, Player, Orga
- ✅ **Offline Queue** - Store positions locally when connection lost
- ✅ **Foreground Service** - Keep GPS active in background

### Start Flow
1. **Splash Screen:** Show app logo (3-5 seconds)
2. **QR Scan Screen:** Camera-based QR scanner
3. **Role Detection:** Parse QR data → determine role
4. **Main Screen:** Navigate to role-specific screen

---

## 👥 User Roles & Behavior

### 🏹 HUNTER
**Position Updates:** Every **10 seconds** via WebSocket  
**GPS:** Always active, highest accuracy  
**UI Components:**
- Map with game boundary + other hunters
- Camera for capture QR scanning
- Panic button
- Battery status indicator
- Network status

**Position Flow:**
```
setInterval(10000ms) → Get GPS → socket.emit('position:update') → Server broadcasts to game room
```

### 👤 PLAYER
**Position Updates:** On demand via WebSocket (when Orga requests ping)  
**GPS:** Always active, highest accuracy (no sending unless requested)  
**UI Components:**
- Status screen (NO MAP - no hunter visibility)
- Panic button
- Battery status
- Network status
- "Waiting for ping..." indicator

**Ping Flow:**
```
socket.on('ping:request', () => {
  Get GPS → socket.emit('position:update')
})
```

### 👔 ORGA
**Position Updates:** None (Orga doesn't send position)  
**GPS:** Not required  
**UI Components:**
- Map with all hunters + player pings
- Event log stream
- Control buttons (request ping, view stats)
- Game statistics dashboard

**Control Flow:**
```
socket.emit('ping:generate', {playerId}) → Server triggers ping → Player sends position
socket.on('position:hunter') → Update hunter marker
socket.on('position:player') → Update player ping
socket.on('event:new') → Add to event log
```

---

## 🔐 Authentication & QR Code

### QR Code Format
QR Code enthält JSON string:
```json
{
  "hostname": "192.168.0.100",
  "participantId": "uuid-v4",
  "name": "John Doe",
  "role": "HUNTER"
}
```

oder alternativ einfacher String:
```
192.168.0.100|uuid-v4|John Doe|HUNTER
```

### Login Flow
1. Scan QR code
2. Parse data (JSON or pipe-separated)
3. Store data locally:
   ```js
   {
     hostname: "192.168.0.100",
     participantId: "uuid-v4",
     name: "John Doe",
     role: "HUNTER",
     gameId: "uuid-v4" // from subsequent API call
   }
   ```
4. Optional: Call `/api/auth/login` für JWT token (falls benötigt)
5. Connect WebSocket with auth data
6. Navigate to role screen

---

## 📡 API Endpoints

### Base URL
```
http://192.168.0.100:3000/api
```

### Authentication

#### POST /auth/login
**Optional** - Falls JWT-basierte Auth gewünscht ist
```json
// Request
{
  "email": "user@example.com",
  "password": "password123"
}

// Response
{
  "accessToken": "eyJhbGciOiJIUzI1...",
  "refreshToken": "eyJhbGciOiJIUzI1...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe"
  }
}
```

#### POST /auth/refresh
Refresh expired access token
```json
// Request
{
  "refreshToken": "eyJhbGciOiJIUzI1..."
}

// Response
{
  "accessToken": "new-token-here",
  "refreshToken": "new-refresh-token"
}
```

---

### Games

#### GET /games/{gameId}
Get game details
```json
// Response
{
  "id": "uuid",
  "name": "Manhunt City Center",
  "status": "ACTIVE",
  "huntingArea": {
    "type": "Polygon",
    "coordinates": [[[lng, lat], [lng, lat], ...]]
  },
  "startedAt": "2026-01-14T10:00:00Z",
  "finishedAt": null
}
```

#### GET /games/{gameId}/participants/me
Get current user's participant info
```json
// Headers: Authorization: Bearer {token}
// Response
{
  "id": "participant-uuid",
  "gameId": "game-uuid",
  "userId": "user-uuid",
  "role": "HUNTER",
  "status": "ACTIVE",
  "joinedAt": "2026-01-14T10:00:00Z"
}
```

#### GET /games/{gameId}/participants
Get all participants in game
```json
// Response
[
  {
    "id": "uuid",
    "userId": "uuid",
    "role": "HUNTER",
    "status": "ACTIVE",
    "fullName": "John Hunter"
  },
  {
    "id": "uuid",
    "userId": "uuid",
    "role": "PLAYER",
    "status": "ACTIVE",
    "fullName": "Jane Player"
  }
]
```

---

### Tracking

#### POST /tracking/games/{gameId}/position
**REST Fallback** - NOT USED (use WebSocket instead)
```json
// Request
{
  "latitude": 48.137154,
  "longitude": 11.576124,
  "accuracy": 5,
  "altitude": 500,
  "speed": 1.5,
  "heading": 45
}

// Response
{
  "id": "position-uuid",
  "gameId": "game-uuid",
  "participantId": "participant-uuid",
  "location": {
    "type": "Point",
    "coordinates": [11.576124, 48.137154]
  },
  "timestamp": "2026-01-14T10:30:00Z",
  "accuracy": 5
}
```

#### GET /tracking/games/{gameId}/hunters
Get current hunter positions (for Map display)
```json
// Response
[
  {
    "participantId": "uuid",
    "userId": "uuid",
    "role": "HUNTER",
    "fullName": "John Hunter",
    "position": {
      "latitude": 48.137154,
      "longitude": 11.576124,
      "timestamp": "2026-01-14T10:30:00Z",
      "accuracy": 5
    }
  }
]
```

#### GET /tracking/games/{gameId}/pings
Get recent player pings (for Map display)
```json
// Response
[
  {
    "id": "ping-uuid",
    "gameId": "game-uuid",
    "userId": "player-uuid",
    "playerName": "Jane Player",
    "actualLocation": {
      "type": "Point",
      "coordinates": [11.576124, 48.137154]
    },
    "displayLocation": {
      "type": "Point",
      "coordinates": [11.576500, 48.137300]
    },
    "offsetDistance": 150,
    "createdAt": "2026-01-14T10:25:00Z"
  }
]
```

---

### Events

#### GET /events/game/{gameId}
Get all events for game (for Event Log)
```json
// Response
[
  {
    "id": "event-uuid",
    "type": "CAPTURE",
    "severity": "INFO",
    "message": "Player captured by Hunter",
    "metadata": {
      "hunterId": "uuid",
      "playerId": "uuid"
    },
    "timestamp": "2026-01-14T10:20:00Z"
  },
  {
    "id": "event-uuid",
    "type": "BOUNDARY_VIOLATION",
    "severity": "WARNING",
    "message": "Player left game area",
    "timestamp": "2026-01-14T10:15:00Z"
  }
]
```

---

### Captures

#### POST /captures/scan
Scan capture QR code (Hunter only)
```json
// Request
{
  "hunterId": "hunter-participant-uuid",
  "qrCode": "scanned-qr-data-string"
}

// Response
{
  "id": "capture-uuid",
  "gameId": "game-uuid",
  "hunterId": "hunter-uuid",
  "playerId": "player-uuid",
  "status": "PENDING",
  "captureTime": "2026-01-14T10:30:00Z"
}
```

---

## 🌐 WebSocket Events

### Connection

#### Connect to WebSocket
```javascript
import io from 'socket.io-client';

const socket = io('ws://192.168.0.100:3000/tracking', {
  auth: {
    token: 'optional-jwt-token'
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});
```

---

### Emit Events (Client → Server)

#### join:game
Join game room and receive initial data
```javascript
socket.emit('join:game', {
  gameId: 'game-uuid',
  userId: 'participant-uuid'
});

// Response
socket.on('join:success', (data) => {
  // data: { gameId, role }
});

// Initial data (only for Hunter/Orga)
socket.on('positions:hunters', (positions) => {
  // Array of hunter positions
});
socket.on('pings:players', (pings) => {
  // Array of player pings
});
```

#### position:update
Send position update (Hunter: every 10s, Player: on ping request)
```javascript
socket.emit('position:update', {
  latitude: 48.137154,
  longitude: 11.576124,
  accuracy: 5,
  altitude: 500,
  speed: 1.5,
  heading: 45,
  isEmergency: false // true if panic button pressed
});

// Response (Player only)
socket.on('position:saved', (data) => {
  // data: { timestamp }
});
```

#### ping:generate
Request player ping (Orga only)
```javascript
socket.emit('ping:generate', {
  playerId: 'player-participant-uuid'
});

// Broadcast to all in game
socket.on('ping:new', (ping) => {
  // ping object with displayLocation
});
```

#### leave:game
Leave game room
```javascript
socket.emit('leave:game');

socket.on('leave:success', () => {
  // Left successfully
});
```

---

### Listen Events (Server → Client)

#### position:hunter
Hunter moved (broadcast to all in game)
```javascript
socket.on('position:hunter', (data) => {
  // data: {
  //   userId: 'hunter-uuid',
  //   position: {
  //     latitude: 48.137154,
  //     longitude: 11.576124,
  //     timestamp: '2026-01-14T10:30:00Z',
  //     accuracy: 5
  //   }
  // }
});
```

#### position:player
Player ping revealed (broadcast to all in game)
```javascript
socket.on('position:player', (data) => {
  // data: {
  //   userId: 'player-uuid',
  //   position: {
  //     latitude: 48.137154,
  //     longitude: 11.576124,
  //     timestamp: '2026-01-14T10:30:00Z'
  //   }
  // }
});
```

#### ping:request
Orga requested player position (Player only)
```javascript
socket.on('ping:request', () => {
  // Immediately send position via position:update
  socket.emit('position:update', { ...currentPosition });
});
```

#### event:boundary_violation
Player/Hunter left game area
```javascript
socket.on('event:boundary_violation', (data) => {
  // data: { userId, position }
});
```

#### event:emergency
Panic button pressed
```javascript
socket.on('event:emergency', (data) => {
  // data: { userId, position }
});
```

#### event:new
New game event created
```javascript
socket.on('event:new', (event) => {
  // event: { id, type, severity, message, timestamp, metadata }
});
```

#### capture:initiated
Capture scan initiated (pending confirmation)
```javascript
socket.on('capture:initiated', (capture) => {
  // capture: { id, hunterId, playerId, status: 'PENDING' }
});
```

#### capture:confirmed
Capture confirmed by Orga
```javascript
socket.on('capture:confirmed', (capture) => {
  // capture: { id, hunterId, playerId, status: 'CONFIRMED' }
});
```

#### capture:rejected
Capture rejected by Orga
```javascript
socket.on('capture:rejected', (capture) => {
  // capture: { id, hunterId, playerId, status: 'REJECTED' }
});
```

#### game:status-changed
Game status changed (PENDING → ACTIVE → PAUSED → FINISHED)
```javascript
socket.on('game:status-changed', (data) => {
  // data: { status: 'ACTIVE' | 'PAUSED' | 'FINISHED' }
});
```

#### participant:status-changed
Participant status changed (ACTIVE → CAPTURED → DISQUALIFIED)
```javascript
socket.on('participant:status-changed', (data) => {
  // data: { userId, status: 'CAPTURED' | 'DISQUALIFIED' }
});
```

#### error
WebSocket error
```javascript
socket.on('error', (error) => {
  // error: { message: 'Error description' }
});
```

---

## 🗂️ Data Models

### Position
```typescript
interface Position {
  id: string; // UUID
  gameId: string;
  participantId: string;
  location: {
    type: 'Point';
    coordinates: [longitude, latitude]; // GeoJSON format
  };
  timestamp: string; // ISO 8601
  accuracy: number; // meters
  altitude?: number; // meters
  speed?: number; // m/s
  heading?: number; // degrees
  isEmergency: boolean;
  isOverride: boolean;
}
```

### Participant
```typescript
interface Participant {
  id: string; // UUID
  gameId: string;
  userId?: string; // null for manual participants
  role: 'HUNTER' | 'PLAYER' | 'ORGA' | 'OPERATOR';
  status: 'ACTIVE' | 'CAPTURED' | 'DISQUALIFIED';
  joinedAt: string;
  fullName: string;
  email?: string;
}
```

### Game
```typescript
interface Game {
  id: string;
  name: string;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'FINISHED';
  huntingArea: GeoJSON.Polygon;
  startedAt?: string;
  pausedAt?: string;
  finishedAt?: string;
  createdAt: string;
}
```

### Event
```typescript
interface GameEvent {
  id: string;
  gameId: string;
  type: 'CAPTURE' | 'BOUNDARY_VIOLATION' | 'EMERGENCY' | 'GAME_START' | 'GAME_END' | 'PARTICIPANT_JOIN' | 'PARTICIPANT_LEAVE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}
```

### Ping
```typescript
interface Ping {
  id: string;
  gameId: string;
  playerId: string;
  playerName: string;
  actualLocation: GeoJSON.Point;
  displayLocation: GeoJSON.Point; // Obscured location
  offsetDistance: number; // meters
  createdAt: string;
}
```

---

## 📱 React Native Implementation Guide

### Tech Stack
```json
{
  "dependencies": {
    "react-native": "^0.73.0",
    "expo": "^50.0.0",
    "expo-location": "^16.5.0",
    "expo-camera": "^14.0.0",
    "expo-barcode-scanner": "^12.8.0",
    "socket.io-client": "^4.6.0",
    "react-native-maps": "^1.10.0",
    "zustand": "^4.5.0",
    "@react-native-async-storage/async-storage": "^1.21.0",
    "react-navigation": "^6.1.0",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/stack": "^6.3.0"
  }
}
```

---

### Project Structure
```
mobile-app/
├── src/
│   ├── screens/
│   │   ├── SplashScreen.tsx
│   │   ├── QRScanScreen.tsx
│   │   ├── HunterScreen.tsx
│   │   ├── PlayerScreen.tsx
│   │   └── OrgaScreen.tsx
│   ├── components/
│   │   ├── GameMap.tsx
│   │   ├── PanicButton.tsx
│   │   ├── BatteryIndicator.tsx
│   │   ├── NetworkStatus.tsx
│   │   └── EventLog.tsx
│   ├── services/
│   │   ├── location.service.ts
│   │   ├── websocket.service.ts
│   │   ├── storage.service.ts
│   │   └── queue.service.ts
│   ├── store/
│   │   ├── auth.store.ts
│   │   ├── location.store.ts
│   │   └── game.store.ts
│   ├── hooks/
│   │   ├── useLocation.ts
│   │   ├── useWebSocket.ts
│   │   └── useQRScanner.ts
│   ├── types/
│   │   └── index.ts
│   └── App.tsx
├── app.json
├── package.json
└── README.md
```

---

### Location Service Implementation

```typescript
// src/services/location.service.ts
import * as Location from 'expo-location';
import { Platform } from 'react-native';

class LocationService {
  private watchId: Location.LocationSubscription | null = null;
  private currentPosition: Location.LocationObject | null = null;
  
  async initialize() {
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      throw new Error('Foreground location permission denied');
    }
    
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      throw new Error('Background location permission denied');
    }
    
    // Start watching position
    await this.startWatching();
  }
  
  async startWatching() {
    this.watchId = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation, // Highest accuracy
        distanceInterval: 0, // Update on any movement
        timeInterval: 1000, // Update every second
      },
      (position) => {
        this.currentPosition = position;
        // Update store
        useLocationStore.getState().updatePosition(position);
      }
    );
  }
  
  async stopWatching() {
    if (this.watchId) {
      this.watchId.remove();
      this.watchId = null;
    }
  }
  
  getCurrentPosition() {
    return this.currentPosition;
  }
  
  async getPositionOnce() {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
  }
}

export const locationService = new LocationService();
```

---

### WebSocket Service Implementation

```typescript
// src/services/websocket.service.ts
import io, { Socket } from 'socket.io-client';
import { locationService } from './location.service';
import { queueService } from './queue.service';

class WebSocketService {
  private socket: Socket | null = null;
  private gameId: string | null = null;
  private participantId: string | null = null;
  private role: string | null = null;
  
  connect(hostname: string) {
    this.socket = io(`ws://${hostname}:3000/tracking`, {
      auth: {
        token: '' // Optional JWT token
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    
    this.setupListeners();
  }
  
  private setupListeners() {
    if (!this.socket) return;
    
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      // Flush offline queue
      queueService.flushQueue(this.socket);
    });
    
    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
    
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    
    // Game events
    this.socket.on('join:success', (data) => {
      console.log('Joined game:', data);
    });
    
    this.socket.on('position:hunter', (data) => {
      // Update hunter position on map
      useGameStore.getState().updateHunterPosition(data);
    });
    
    this.socket.on('position:player', (data) => {
      // Update player ping on map
      useGameStore.getState().updatePlayerPing(data);
    });
    
    this.socket.on('ping:request', () => {
      // Player: Send position immediately
      this.sendPosition();
    });
    
    this.socket.on('event:new', (event) => {
      useGameStore.getState().addEvent(event);
    });
    
    this.socket.on('capture:initiated', (capture) => {
      useGameStore.getState().addCapture(capture);
    });
  }
  
  joinGame(gameId: string, participantId: string, role: string) {
    this.gameId = gameId;
    this.participantId = participantId;
    this.role = role;
    
    this.socket?.emit('join:game', {
      gameId,
      userId: participantId,
    });
  }
  
  sendPosition() {
    const position = locationService.getCurrentPosition();
    if (!position) return;
    
    const data = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
      altitude: position.coords.altitude || undefined,
      speed: position.coords.speed || undefined,
      heading: position.coords.heading || undefined,
      isEmergency: false,
    };
    
    if (this.socket?.connected) {
      this.socket.emit('position:update', data);
    } else {
      // Queue for later
      queueService.addToQueue(data);
    }
  }
  
  sendPanic() {
    const position = locationService.getCurrentPosition();
    if (!position) return;
    
    const data = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
      isEmergency: true,
    };
    
    this.socket?.emit('position:update', data);
  }
  
  requestPing(playerId: string) {
    this.socket?.emit('ping:generate', { playerId });
  }
  
  disconnect() {
    this.socket?.emit('leave:game');
    this.socket?.disconnect();
  }
}

export const websocketService = new WebSocketService();
```

---

### Hunter Implementation

```typescript
// src/screens/HunterScreen.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { websocketService } from '../services/websocket.service';
import { locationService } from '../services/location.service';
import GameMap from '../components/GameMap';
import PanicButton from '../components/PanicButton';
import BatteryIndicator from '../components/BatteryIndicator';

export default function HunterScreen() {
  const intervalRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // Start sending position every 10 seconds
    intervalRef.current = setInterval(() => {
      websocketService.sendPosition();
    }, 10000);
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  return (
    <View style={styles.container}>
      <GameMap showHunters showBoundary />
      <BatteryIndicator />
      <PanicButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
```

---

### Player Implementation

```typescript
// src/screens/PlayerScreen.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PanicButton from '../components/PanicButton';
import BatteryIndicator from '../components/BatteryIndicator';
import { useGameStore } from '../store/game.store';

export default function PlayerScreen() {
  const status = useGameStore((state) => state.status);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PLAYER MODE</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.info}>
        Warte auf Ping-Anforderung...
      </Text>
      <BatteryIndicator />
      <PanicButton />
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
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  status: {
    fontSize: 18,
    color: '#0f0',
    marginTop: 20,
  },
  info: {
    fontSize: 14,
    color: '#888',
    marginTop: 10,
  },
});
```

---

## 🔒 Android Kiosk Mode Setup

### AndroidManifest.xml
```xml
<manifest>
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
  
  <application>
    <activity
      android:name=".MainActivity"
      android:launchMode="singleInstance"
      android:screenOrientation="portrait"
      android:configChanges="keyboard|keyboardHidden|orientation|screenSize">
      
      <!-- Set as launcher -->
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.HOME" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    
    <!-- Foreground service for location -->
    <service
      android:name=".LocationService"
      android:foregroundServiceType="location"
      android:exported="false" />
  </application>
</manifest>
```

### Disable Back Button
```typescript
// src/App.tsx
import { BackHandler } from 'react-native';

useEffect(() => {
  const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
    // Disable back button
    return true;
  });
  
  return () => backHandler.remove();
}, []);
```

---

## ⚡ Performance & Battery

### Battery Considerations
- **GPS High Accuracy:** ~15-25% per hour
- **WebSocket Connection:** ~2-5% per hour
- **Screen On:** ~10-20% per hour
- **Total:** ~30-50% per hour

**Mitigation:**
- User MUST have powerbank
- Show warning at <20% battery
- Consider reducing GPS accuracy at <10% (optional)

### GPS Optimization
```typescript
// High accuracy but update only on movement
{
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 5, // Update only if moved 5+ meters
  timeInterval: 1000, // Check every second
}
```

### Network Optimization
- Batch position updates if connection slow
- Use WebSocket compression
- Queue positions locally when offline (max 100)
- Auto-flush queue on reconnect

---

## 🧪 Testing Checklist

### Functional Tests
- [ ] QR code scanning works
- [ ] Login flow successful
- [ ] WebSocket connection establishes
- [ ] GPS location updates continuously
- [ ] Hunter sends position every 10s
- [ ] Player receives ping requests
- [ ] Player sends position on ping
- [ ] Map displays hunters correctly
- [ ] Panic button works
- [ ] Capture scanning works
- [ ] Event log updates in real-time

### Edge Cases
- [ ] Network disconnection → offline queue
- [ ] Network reconnection → flush queue
- [ ] GPS signal lost
- [ ] Battery low scenario
- [ ] App backgrounded
- [ ] App foregrounded
- [ ] WebSocket timeout
- [ ] Multiple rapid position updates
- [ ] Concurrent capture attempts

### Performance Tests
- [ ] Battery drain measurement
- [ ] Memory usage profiling
- [ ] Network data usage
- [ ] GPS accuracy verification
- [ ] WebSocket latency measurement

---

## 🚀 Deployment

### Build APK
```bash
# Expo EAS Build
eas build --platform android --profile production

# Or local build
expo build:android
```

### Installation
1. Transfer APK to device
2. Enable "Install from Unknown Sources"
3. Install APK
4. Set as default launcher
5. Grant all permissions (Location, Camera)
6. Start app

### Device Admin Setup
Für vollständigen Kiosk-Modus:
1. Settings → Security → Device Administrators
2. Enable app as Device Admin
3. Lock task mode aktivieren

---

## 📝 Environment Variables

Create `.env` file:
```bash
# Server
API_BASE_URL=http://192.168.0.100:3000
WS_URL=ws://192.168.0.100:3000

# Features
ENABLE_OFFLINE_QUEUE=true
MAX_QUEUE_SIZE=100
GPS_UPDATE_INTERVAL=1000
HUNTER_POSITION_INTERVAL=10000
```

---

## 🐛 Known Issues & Solutions

### Issue: GPS not updating in background
**Solution:** Enable Foreground Service with notification

### Issue: WebSocket disconnects frequently
**Solution:** Implement exponential backoff reconnection

### Issue: Battery drains too fast
**Solution:** User must use powerbank, reduce screen brightness

### Issue: App exits on back button
**Solution:** Override BackHandler in React Native

### Issue: Positions queue grows too large
**Solution:** Implement max queue size (100), drop oldest

---

## 📚 Additional Resources

- **Expo Location Docs:** https://docs.expo.dev/versions/latest/sdk/location/
- **Socket.IO Client:** https://socket.io/docs/v4/client-api/
- **React Native Maps:** https://github.com/react-native-maps/react-native-maps
- **Zustand State Management:** https://zustand-demo.pmnd.rs/

---

## 🎯 Implementation Phases

### Phase 1: Core Setup (Week 1)
- [ ] Expo project scaffolding
- [ ] Navigation setup
- [ ] QR scanner implementation
- [ ] Basic WebSocket connection
- [ ] Location service implementation

### Phase 2: Role Screens (Week 2)
- [ ] Hunter screen + map
- [ ] Player screen (no map)
- [ ] Orga dashboard
- [ ] Position sending logic
- [ ] Ping request handling

### Phase 3: Features (Week 3)
- [ ] Panic button
- [ ] Capture scanning
- [ ] Event log
- [ ] Battery indicator
- [ ] Network status

### Phase 4: Polish (Week 4)
- [ ] Offline queue
- [ ] Error handling
- [ ] Performance optimization
- [ ] Kiosk mode setup
- [ ] Testing & bugfixes

---

## ✅ Final Checklist

Before deployment, ensure:
- [ ] All permissions granted (Location, Camera)
- [ ] Foreground service enabled
- [ ] WebSocket connects successfully
- [ ] GPS tracking works in background
- [ ] Hunter sends every 10s
- [ ] Player responds to pings
- [ ] Orga receives all events
- [ ] Map displays correctly
- [ ] QR scanner works
- [ ] Panic button functional
- [ ] Offline queue works
- [ ] Battery indicator accurate
- [ ] Kiosk mode enabled
- [ ] Back button disabled
- [ ] APK signed and optimized

---

**Version:** 1.0.0  
**Last Updated:** 2026-01-14  
**Contact:** dev@manhunt-game.local
