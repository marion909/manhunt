# MANHUNT - Mobile App

React Native Expo App für GPS-Tracking im Manhunt Game.

## 🚀 Quick Start

### Installation
```bash
npm install
```

### Development
```bash
# Start Expo Dev Server
npx expo start

# Run on Android
npx expo start --android

# Run on iOS (macOS only)
npx expo start --ios
```

## 📱 Features

✅ **QR Code Scanner** - Login via QR scan  
✅ **GPS Tracking** - High accuracy, always active  
✅ **WebSocket Communication** - Real-time position updates  
✅ **Role-Based UI** - Hunter, Player, Orga screens  
✅ **Offline Queue** - Positions stored when offline  
✅ **Panic Button** - Emergency position sending  
✅ **Battery Indicator** - Monitor device battery  
✅ **Network Status** - WebSocket connection status

## 🏗️ Architecture

```
app/
├── src/
│   ├── screens/          # Main screens (Splash, QRScan, Hunter, Player, Orga)
│   ├── components/       # Reusable UI components (PanicButton, BatteryIndicator)
│   ├── services/         # Business logic (LocationService, WebSocketService)
│   ├── store/           # Zustand state management (auth, location, game)
│   ├── hooks/           # Custom React hooks
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── App.tsx              # Main app entry point
└── app.json             # Expo configuration
```

## 🔐 QR Code Format

QR Code should contain:
```json
{
  "hostname": "192.168.0.100",
  "participantId": "uuid-v4",
  "name": "John Doe",
  "role": "HUNTER"
}
```

Or pipe-separated:
```
192.168.0.100|uuid-v4|John Doe|HUNTER
```

## 📡 Server Connection

**API:** `http://192.168.0.100:3000/api`  
**WebSocket:** `ws://192.168.0.100:3000/tracking`

## 👥 User Roles

### HUNTER
- Position sent every 10 seconds via WebSocket
- Map with game boundary + other hunters
- Camera for capture QR scanning

### PLAYER
- GPS always active but position sent only on Orga request
- No map (no visibility of hunters)
- Listens for `ping:request` WebSocket event

### ORGA
- Dashboard with map showing all positions
- Event log stream
- Control buttons for ping requests

## 📦 Dependencies

- `expo` - Development platform
- `react-native` - Mobile framework
- `socket.io-client` - WebSocket communication
- `zustand` - State management
- `expo-location` - GPS tracking
- `expo-camera` - QR code scanning
- `expo-barcode-scanner` - Barcode scanning
- `expo-battery` - Battery monitoring
- `@react-navigation` - Navigation
- `@react-native-async-storage` - Local storage

## 🔧 Configuration

Edit `app.json` for:
- App name and bundle identifier
- Permissions (Location, Camera)
- Splash screen and icons
- Android/iOS specific settings

## 🛠️ Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build APK for Android
eas build --platform android --profile production

# Build for iOS
eas build --platform ios --profile production
```

## 📝 Environment

No `.env` file needed - all configuration is in code:
- Server URL: `192.168.0.100:3000`
- WebSocket URL: `ws://192.168.0.100:3000`

## 🧪 Testing

```bash
# Start app in development
npx expo start

# Test on physical device (recommended for GPS)
npx expo start --android
```

**Note:** GPS tracking requires physical device. Emulator has limited GPS capabilities.

## 📋 Implementation Status

✅ Project structure  
✅ Type definitions  
✅ State management (Zustand stores)  
✅ Location service (GPS tracking)  
✅ WebSocket service  
✅ Queue service (offline positions)  
✅ All screens (Splash, QRScan, Hunter, Player, Orga)  
✅ Components (PanicButton, BatteryIndicator, NetworkStatus)  
✅ Navigation setup  
✅ Back button disabled  

🔄 **TODO:**
- [ ] Map component with react-native-maps
- [ ] Capture QR scanning for hunters
- [ ] Android Kiosk mode configuration
- [ ] Battery optimization
- [ ] Testing on physical devices
- [ ] Production build

## 🎯 Next Steps

1. Test app on physical Android device
2. Verify GPS tracking accuracy
3. Test WebSocket connection to server
4. Implement map component
5. Test all three roles (Hunter, Player, Orga)
6. Configure Android Kiosk mode
7. Build production APK

## 📄 Documentation

Full API documentation available in `../app.md`

---

**Server Repository:** `../backend`  
**Frontend Repository:** `../frontend`  
**Version:** 1.0.0
