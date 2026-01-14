# MANHUNT - Echtzeit GPS-Verfolgungsspiel Plattform

Eine Live-Plattform zum Organisieren, Steuern und Überwachen von Manhunt-Spielen mit GPS-Tracking, Geofencing und rollenbasierter Zugriffskontrolle.

## 🎮 Projektübersicht

MANHUNT ist eine Echtzeit-Multiplayer-Tracking-Plattform, die es ermöglicht, GPS-basierte Verfolgungsspiele mit komplexen Regeln und Rollen durchzuführen.

### Rollen

- **Orga (Admin)**: Vollzugriff auf Spiel-Erstellung, Konfiguration und Verwaltung
- **Kommandozentrale (Operator)**: Überwachungszugriff für Koordination
- **Hunter**: Sieht eigene Position, andere Hunter und Player-Pings
- **Player**: Sieht nur Spielbereich und Timer bis zum nächsten Ping

## 🏗️ Tech Stack

### Backend
- **Runtime**: Node.js 22
- **Framework**: NestJS (TypeScript)
- **Datenbank**: PostgreSQL 16 + PostGIS
- **Caching**: Redis 7
- **WebSockets**: Socket.IO
- **Queue**: Bull (für Ping-Scheduler)
- **Auth**: JWT + Passport

### Frontend (Web)
- **Framework**: Next.js 16 (App Router)
- **Maps**: Mapbox GL JS
- **State**: Zustand + TanStack Query
- **Styling**: TailwindCSS 4
- **WebSocket**: Socket.IO Client

### Mobile App
- **Framework**: React Native + Expo
- **Camera**: expo-camera (QR-Scanner)
- **State**: Zustand
- **WebSocket**: Socket.IO Client

## 🚀 Schnellstart

### Voraussetzungen

- [Docker](https://www.docker.com/) & Docker Compose
- [Git](https://git-scm.com/)
- [Expo Go](https://expo.dev/client) (für Mobile App)

### Installation

```bash
# Repository klonen
git clone https://github.com/your-org/manhunt.git
cd manhunt

# Alle Services mit Docker starten
docker-compose up -d

# Mobile App starten (separates Terminal)
cd app
npm install
npx expo start
```

### URLs

- **Backend API**: http://localhost:3000
- **Frontend**: http://localhost:3001
- **API Docs**: http://localhost:3000/api
- **Expo**: http://localhost:8081

## 📁 Projektstruktur

```
manhunt/
├── backend/          # NestJS Backend
│   ├── src/
│   │   ├── auth/           # JWT Authentication
│   │   ├── users/          # User Management
│   │   ├── games/          # Game & Participant Management
│   │   ├── tracking/       # GPS Tracking & Ping System
│   │   ├── events/         # Event/Audit System
│   │   ├── invitations/    # Token-based Invitations
│   │   ├── rules/          # Game Rules Engine
│   │   ├── captures/       # Hunter-Player Captures
│   │   └── geospatial/     # PostGIS Integration
│   └── Dockerfile
├── frontend/         # Next.js Web Frontend
│   ├── app/
│   │   └── game/[id]/      # Live Game View
│   ├── components/
│   │   ├── map.tsx         # Mapbox Integration
│   │   ├── participant-list.tsx
│   │   └── ...
│   ├── hooks/
│   │   ├── use-websocket.ts
│   │   └── use-geolocation.ts
│   └── Dockerfile
├── app/              # React Native Mobile App
│   ├── src/
│   │   ├── screens/
│   │   │   ├── HunterScreen.tsx
│   │   │   ├── PlayerScreen.tsx
│   │   │   └── QRScanScreen.tsx
│   │   ├── services/
│   │   │   └── websocket.service.ts
│   │   └── store/
│   └── app.json
├── docker-compose.yml
└── README.md
```

## 🗺️ Features

### ✅ Implementiert

#### Core Features
- ✅ Benutzer-Authentifizierung (JWT)
- ✅ Spiel-Erstellung mit Geofencing (Polygon-Editor)
- ✅ Einladungs-Token-System
- ✅ Live-GPS-Tracking (WebSocket)
- ✅ Ping-System für Player (manuell durch Orga)
- ✅ Rollen-Management (Orga, Operator, Hunter, Player)

#### Web Frontend
- ✅ Echtzeit-Karte mit Mapbox GL
- ✅ Position-History Visualisierung
- ✅ Teilnehmer-Verwaltung mit QR-Code-Generierung
- ✅ Ping-Button für einzelne Spieler
- ✅ Event-Timeline
- ✅ Anti-Cheat-Alerts
- ✅ Capture-Management

#### Mobile App
- ✅ QR-Code-Scanner für Spielbeitritt
- ✅ Hunter-Modus mit Live-Karte
- ✅ Player-Modus mit Ping-Status-Anzeige
- ✅ Panic-Button für Notfälle
- ✅ Automatische GPS-Position-Sendung
- ✅ Offline-Queue für schlechte Verbindung
- ✅ Batterie-Anzeige

#### Backend
- ✅ WebSocket Gateway mit Auth
- ✅ Position-Broadcasting nach Rolle
- ✅ Ping-Generierung mit Offset
- ✅ Geofencing-Validierung
- ✅ Event-Logging

### 🔄 In Entwicklung
- 🔄 Regelwerk-Engine (aktiv/deaktivierbar)
- 🔄 Automatische Ping-Scheduler
- 🔄 Capture-Bestätigung mit QR-Code

### ⏳ Geplant
- ⏳ Push-Benachrichtigungen
- ⏳ Offline-Karten-Support
- ⏳ Spiel-Export/Replay
- ⏳ Statistik-Dashboard

## 🛠️ Entwicklung

### Backend

```bash
cd backend
npm install
npm run start:dev

# Migrations
npm run migration:run
```

### Frontend

```bash
cd frontend
bun install
bun run dev
```

### Mobile App

```bash
cd app
npm install
npx expo start

# Für Android
npx expo start --android

# Für iOS
npx expo start --ios
```

## 🐳 Docker

```bash
# Alle Services starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f backend

# Einzelnen Service neu bauen
docker-compose build backend --no-cache
docker-compose up -d backend

# Services stoppen
docker-compose down

# Mit Volumes entfernen (Datenbank-Reset!)
docker-compose down -v
```

## 📊 Datenbank

### Schema

- `users`: Benutzerkonten (Web-Login)
- `games`: Spiel-Sessions mit Konfiguration
- `game_participants`: Teilnehmer mit Rollen (auch ohne User-Account)
- `game_boundaries`: Polygone für Spielbereiche
- `game_rules`: Konfigurierbare Spielregeln
- `positions`: GPS-Tracking (Time-Series)
- `pings`: Enthüllte Player-Positionen mit Offset
- `captures`: Hunter-Player Fänge
- `events`: Audit-Log
- `invitations`: Einladungs-Tokens

### PostGIS

Das Projekt nutzt PostGIS für räumliche Datenbanken:
- Point-in-Polygon-Queries (Geofencing)
- Distanzberechnungen
- Spatial Indexes (GIST)

## 🔐 Umgebungsvariablen

### Backend (.env)

```env
DATABASE_URL=postgresql://manhunt_user:password@localhost:5432/manhunt
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
NODE_ENV=development
PORT=3000
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

## 📱 Mobile App Setup

### QR-Code Format

Die Mobile App verwendet QR-Codes zum Spielbeitritt:

```
hostname|gameId|participantId|displayName|role
```

Beispiel:
```
192.168.0.100|d5091eb9-...|be643ba0-...|Player 1|player
```

### Unterstützte Geräte

- Android 10+ (getestet auf Samsung Galaxy S23)
- iOS 14+ (mit Expo Go)

## 📝 API-Dokumentation

Die API-Dokumentation ist verfügbar unter:
- Swagger UI: http://localhost:3000/api
- OpenAPI JSON: http://localhost:3000/api-json

## 🧪 Testing

```bash
# Backend Tests
cd backend
npm run test              # Unit tests
npm run test:e2e          # E2E tests
npm run test:cov          # Coverage
```

## 📄 Lizenz

MIT

## 👥 Entwicklung

Entwickelt mit GitHub Copilot (Claude Opus 4.5)
