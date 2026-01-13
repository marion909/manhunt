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
- **Runtime**: Bun + Node.js 24
- **Framework**: NestJS (TypeScript)
- **Datenbank**: PostgreSQL 16 + PostGIS
- **Caching**: Redis 7
- **WebSockets**: Socket.IO
- **Queue**: Bull (für Ping-Scheduler)
- **Auth**: JWT + Passport

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Maps**: Mapbox GL JS
- **State**: Zustand
- **Styling**: TailwindCSS
- **WebSocket**: Socket.IO Client

## 🚀 Schnellstart

### Voraussetzungen

- [Bun](https://bun.sh) >= 1.0
- [Docker](https://www.docker.com/) & Docker Compose
- [Git](https://git-scm.com/)

### Installation

```bash
# Repository klonen
git clone https://github.com/your-org/manhunt.git
cd manhunt

# Docker-Services starten (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Backend einrichten
cd backend
cp .env.example .env
bun install
bun run migration:run
bun run start:dev

# Frontend einrichten (neues Terminal)
cd ../frontend
cp .env.local.example .env.local
bun install
bun run dev
```

### URLs

- **Backend API**: http://localhost:3000
- **Frontend**: http://localhost:3001
- **API Docs**: http://localhost:3000/api

## 📁 Projektstruktur

```
manhunt/
├── backend/          # NestJS Backend
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── games/
│   │   ├── tracking/
│   │   ├── events/
│   │   ├── invitations/
│   │   ├── rules/
│   │   └── geospatial/
│   ├── test/
│   └── Dockerfile
├── frontend/         # Next.js Frontend
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── hooks/
├── docker-compose.yml
└── README.md
```

## 🗺️ Features

### Phase 1 (MVP) - Aktuell in Entwicklung
- ✅ Benutzer-Authentifizierung
- ✅ Spiel-Erstellung mit Geofencing
- ✅ Einladungs-Token-System
- ✅ Live-GPS-Tracking (WebSocket)
- ✅ Ping-System für Player
- ✅ Rollen-Management

### Phase 2 (Geplant)
- ⏳ Regelwerk-Engine
- ⏳ Capture-Logik
- ⏳ Anti-Cheat-Mechanismen
- ⏳ Event-Timeline

### Phase 3 (Geplant)
- ⏳ Sicherheitsfeatures (Panik-Button)
- ⏳ Performance-Optimierung
- ⏳ Logging & Export

### Phase 4 (Geplant)
- ⏳ Mobile App (Flutter/React Native)
- ⏳ Offline-Support
- ⏳ Push-Benachrichtigungen

## 🛠️ Entwicklung

### Backend

```bash
cd backend

# Development
bun run start:dev

# Tests
bun run test
bun run test:e2e

# Migrations
bun run migration:generate -- src/migrations/MigrationName
bun run migration:run
bun run migration:revert

# Linting
bun run lint
bun run format
```

### Frontend

```bash
cd frontend

# Development
bun run dev

# Build
bun run build
bun run start

# Linting
bun run lint
```

## 🐳 Docker

```bash
# Alle Services starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f backend

# Services stoppen
docker-compose down

# Mit Volumes entfernen
docker-compose down -v
```

## 📊 Datenbank

### Schema

- `users`: Benutzerkonten
- `games`: Spiel-Sessions
- `game_participants`: Teilnehmer mit Rollen
- `game_boundaries`: Polygone für Spielbereiche
- `positions`: GPS-Tracking (Time-Series)
- `pings`: Enthüllte Player-Positionen
- `events`: Audit-Log
- `invitations`: Einladungs-Tokens

### PostGIS

Das Projekt nutzt PostGIS für räumliche Datenbanken:
- Point-in-Polygon-Queries (Geofencing)
- Distanzberechnungen (Haversine)
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
NEXT_PUBLIC_WS_URL=ws://localhost:3000
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

## 📝 API-Dokumentation

Die API-Dokumentation ist verfügbar unter:
- Swagger UI: http://localhost:3000/api
- OpenAPI JSON: http://localhost:3000/api-json

## 🧪 Testing

```bash
# Backend Tests
cd backend
bun run test              # Unit tests
bun run test:e2e          # E2E tests
bun run test:cov          # Coverage

# Frontend Tests
cd frontend
bun run test
```

## 🚀 Deployment

### Production Build

```bash
# Backend
cd backend
docker build -t manhunt-backend:latest --target production .

# Frontend
cd frontend
docker build -t manhunt-frontend:latest .
```

### CI/CD

Das Projekt verwendet GitHub Actions für:
- Automatische Tests bei Pull Requests
- Build & Deployment bei Merges in `main`
- Staging-Deployment bei Merges in `develop`

## 📄 Lizenz

TBD

## 👥 Team

TBD

## 🤝 Beitragen

TBD
