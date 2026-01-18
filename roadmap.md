🧠 Gesamtüberblick – Systemidee

Ziel:
Eine Plattform, mit der ein Orga-Team ein Manhunt-Spiel planen, steuern und überwachen kann – live, regelbasiert und revisionssicher.

Kernkomponenten:

Web-Plattform (Orga + Kommandozentrale)

Mobile App (Hunter & Player) – später

Realtime-Backend (Tracking, Events, Rules Engine)

Karten- & Geofencing-System

Game-Rules & State Machine

👥 Rollen & Rechte (sehr wichtig)
1️⃣ Orga (Admin)

Vollzugriff

Spiel erstellen & konfigurieren

Spielgebiet definieren

Spieler & Hunter einladen

Live-Überwachung aller Standorte

Regelverstöße sehen

Spieler disqualifizieren

Pings auslösen / prüfen

Spiel pausieren / beenden

2️⃣ Kommandozentrale (Operator)

Eingeschränkter Zugriff

Sieht alle Hunter live

Sieht Player nur als Pings

Sieht Events (Capture, Regelverstöße)

Kann Hunter koordinieren

Keine Admin-Änderungen

3️⃣ Hunter

Sieht eigene Position

Sieht alle Hunter

Sieht Player-Pings

Kann Capture melden

Kann Hinweise senden

4️⃣ Player

Sieht nur eigenes Spielgebiet

Sieht Timer bis nächster Ping

Kann Notfall-Button drücken

Keine Sicht auf Hunter

🗺️ Spielgebiet & Kartenlogik
Spielgebiet (Orga-Definition)

Polygon (Google Maps / Mapbox Draw)

Optional:

Safe Zones

No-Go-Areas

Endzone(s)

Regeln:

❌ Spieler verlässt Gebiet → Warnung → Disqualifikation

❌ Hunter verlässt Gebiet → Warnung

❌ Betreten von No-Go-Areas → sofortiger Alarm

📍 Standort- & Tracking-Regeln
Player

GPS wird kontinuierlich getrackt

Standort wird nicht live angezeigt

Alle X Stunden (z. B. 2h):

automatischer Ping

Ping = Standort + Zeitstempel

Optional:

Ping-Radius (z. B. 200–500 m)

Fake-Ping-Delay (z. B. 5–15 Min)

Hunter

Standort live sichtbar

Update-Intervall: z. B. alle 5–10 Sekunden

⏱️ Spielregeln (Rules Engine)
Standardregeln (konfigurierbar)

Spielzeit (z. B. 72h)

Ping-Intervall Player

Max. Distanz Capture (z. B. 10 m)

Capture-Bestätigung:

Hunter meldet

Orga bestätigt

Nachtregeln (z. B. kein Capture 00–06 Uhr)

Capture-Regel

Hunter meldet Capture

GPS-Check:

Distanz < X Meter

Player aktiv

Player wird:

„Gefangen“

oder „Ausgeschieden“

🚨 Sicherheit & Notfall
Panic / Emergency Button (Player)

Sendet:

Live-Position

Dauertracking

Sichtbar für:

Orga

Kommandozentrale

Spiel pausierbar

Anti-Cheat

GPS-Spoofing Detection

Geschwindigkeit > 50 km/h → Flag

Teleport-Sprünge → Flag

App im Hintergrund zu lange → Warnung

🔗 Einladungssystem
Einladungslink

Token-basiert

Rolle fix (Player/Hunter/Operator)

Ablaufdatum

Einmal oder mehrfach nutzbar

📊 Events & Logging

Alles wird geloggt:

Positionsupdates

Pings

Regelverstöße

Capture-Versuche

Disqualifikationen

Notfälle

➡️ Wichtig für Transparenz & Streitfälle

🧱 Technische Architektur (empfohlen)
Frontend (Web)

React / Next.js

Mapbox oder Google Maps

Live-WebSockets

Backend

Node.js (NestJS) oder Laravel

PostgreSQL + PostGIS

Redis (Realtime)

WebSockets / Socket.IO

App (später)

Flutter oder React Native

Background-GPS

Offline-Fallback

🛣️ ROADMAP – Programmieren in Phasen
🟢 Phase 1 – Grundlagen (MVP Web)

⏱️ 2–4 Wochen

User-Auth (Orga)

Spiel erstellen

Spielgebiet zeichnen

Rollenmodell

Einladungssystem

Kartenansicht (statisch)

✅ Ergebnis: Spiel planbar

🟡 Phase 2 – Live-Tracking Backend

⏱️ 3–4 Wochen

Positions-API

WebSockets

Hunter Live-Tracking

Player Ping-Logik

Kommandozentrale-View

✅ Ergebnis: Spiel steuerbar

🟠 Phase 3 – Regeln & Events

⏱️ 3–5 Wochen

Rules Engine

Capture-Logik

Disqualifikation

Anti-Cheat

Event-Timeline

✅ Ergebnis: Spiel fair & kontrollierbar

🔵 Phase 4 – Sicherheit & Skalierung

⏱️ 2–3 Wochen

Panic Button

Admin-Overrides

Logging & Export

Performance-Optimierung

🟣 Phase 5 – Mobile App

⏱️ 4–8 Wochen

iOS / Android App

Background GPS

Push Notifications

Offline-Support

🚀 Nächste sinnvolle Schritte

Wenn du willst, kann ich dir als Nächstes:

Datenbank-Schema (ER-Diagramm)

API-Endpoints (OpenAPI Spec)

UX-Flow für Orga / Kommandozentrale

Anti-Cheat-Algorithmen

Pitch-Deck / Investoren-Story

Sag mir einfach womit du starten willst.

---

## 🎮 Game Rules System (Implemented)

### Übersicht
Das Regelwerk besteht aus 4 speziellen Spielmechaniken, die pro Spiel aktiviert und Spielern zugewiesen werden können:

### 1. Silenthunt (Automatische Pings)
- **Beschreibung**: Automatische Ping-Anforderungen zu festen Zeiten
- **Timing**: Jede volle Stunde (0:00, 1:00, 2:00, ...)
- **Zonen-Logik**:
  - Innere Zone: Häufigere Pings (z.B. alle 2h)
  - Äußere Zone: Seltenere Pings (z.B. alle 4h)
  - Outer Zone Boundary für Übergang
- **Respekt für Regeneration**: Spieler mit aktivem Regeneration werden übersprungen

### 2. Speedhunt (Hunter-ausgelöste Pings)
- **Beschreibung**: Hunter können auf einzelne Spieler Ping-Bursts auslösen
- **Limit**: Konfigurierbare tägliche Nutzungen (z.B. 3 pro Tag)
- **Burst**: Schnelle aufeinanderfolgende Pings (z.B. 5 Pings in 30 Sekunden)
- **Benachrichtigung**: Alle Spieler werden informiert wenn Speedhunt gestartet wird
- **Countdown**: UI zeigt verbleibende Pings und Zeit

### 3. Regeneration (Spieler-Schutz)
- **Beschreibung**: Einmalige Schutzmöglichkeit für Spieler
- **Aktivierung**: Spieler aktiviert selbst über App
- **Wirkung**: Blockiert alle Pings für die konfigurierte Dauer
- **Nutzung**: Einmalig pro Spiel
- **UI**: Countdown-Timer während aktiver Regeneration

### 4. Hunter Anfragen (Jäger-Karte)
- **Beschreibung**: Spieler kann einmalig die Jäger-Positionen sehen
- **Aktivierung**: Spieler aktiviert selbst über App
- **Wirkung**: Zeigt alle aktuellen Jäger-Positionen auf Karte
- **Dauer**: Konfigurierbar (z.B. 5 Minuten)
- **Nutzung**: Einmalig pro Spiel

### Technische Implementierung

**Backend:**
- `ParticipantRuleState` Entity: Speichert pro-Spieler Regelstatus
- `SpeedhuntSession` Entity: Aktive Speedhunt-Sitzungen
- `SilenthuntSchedulerService`: Cron-Job für automatische Pings
- `RulesService`: Alle Regel-Logik und Zustandsverwaltung
- `TrackingController`: REST-Endpoints für alle Regeln

**Frontend (Hunter Dashboard):**
- `SpeedhuntPanel`: UI für Speedhunt-Auslösung
- Player-Auswahl und Ping-Buttons

**Mobile App:**
- `RegenerationPanel`: Aktivierungs-Button und Countdown
- `HunterAnfragenPanel`: Aktivierung und Karten-Link
- `HunterMapScreen`: Karte mit Jäger-Positionen

### Regel-Zuweisung
Regeln werden pro Spieler über die Orga-Oberfläche zugewiesen:
- `POST /rules/participants/:participantId/rules/:ruleType/assign`
- Aktivierungsstatus wird in `participant_rule_states` Tabelle gespeichert

---

## 🃏 Joker-System (Implementiert - Session 16.01.2026)

### Neue RuleTypes
- `CATCH_FREE`: 3 Stunden Schutz vor Capture
- `FAKE_PING`: Einmaliger falscher Standort-Ping
- `HOTEL_BONUS`: 6 Stunden Pause von Pings (mit Auto-Ping bei Ablauf)

### Joker-Endpoints

**Catch-Free:**
- `POST /api/rules/jokers/catch-free/activate` - Aktivieren
- `GET /api/rules/jokers/catch-free/:participantId` - Status abfragen

**Hotel-Bonus:**
- `POST /api/rules/jokers/hotel-bonus/activate` - Aktivieren (6h Ping-Pause)
- `GET /api/rules/jokers/hotel-bonus/:participantId` - Status abfragen
- Automatischer Ping wenn Bonus abläuft

**Fake-Ping:**
- `POST /api/rules/jokers/fake-ping/use` - Fake-Position senden
- `GET /api/rules/jokers/fake-ping/:participantId` - Verfügbarkeit prüfen

### Hotel-Bonus Integration
- SilenthuntScheduler prüft aktive Hotel-Bonus vor Ping-Generierung
- Cron-Job prüft abgelaufene Hotel-Bonus und triggert sofortige Pings
- Ping-Entity hat neues `metadata` Feld für Fake-Ping-Markierung

---

## 📸 Foto-Upload System (Implementiert)

### UploadsModule
Neues Modul für Datei-Uploads:
- `UploadsService`: Speicherung, Validierung, Löschung
- `UploadsController`: REST-Endpoints

### Endpoints
- `POST /api/uploads/capture-photo` - Capture-Beweis hochladen
- `POST /api/uploads/handcuff-photo` - Handschellen-Foto hochladen  
- `POST /api/uploads/profile-photo` - Profilbild hochladen

### Capture-Flow (Zweistufig)
1. **QR-Scan**: Hunter scannt Player-QR → Status: `PENDING_HANDCUFF`
2. **Handschellen-Foto**: Hunter lädt Foto hoch → Status: `CONFIRMED`

### Capture Entity Erweiterungen
- `handcuffApplied: boolean` - Handschellen angelegt?
- `handcuffPhotoUrl: string` - URL zum Handschellen-Foto
- `capturePhotoUrl: string` - URL zum Capture-Beweis

---

## 🛡️ Detection Services (Implementiert)

### BoundaryTimerService
Überwacht Spieler außerhalb des Spielgebiets:
- Speichert Verletzungs-Timer im Memory
- Warnung bei 75% der erlaubten Zeit
- Eliminierung nach Limit (Default: 15 Min)
- Events: `BOUNDARY_WARNING`, `PLAYER_ELIMINATED`

### StationaryDetectionService  
GPS-basierte Erkennung von privaten Bereichen:
- Analysiert Bewegungsmuster (30-Min-Fenster)
- Threshold: 50m Bewegungsradius
- Markiert stationäre Spieler als "möglicherweise in privatem Bereich"
- Cron: Alle 5 Minuten

### ProximityDetectionService
Warnt Spieler wenn Hunter in der Nähe:
- DANGER Zone: 200m (Default)
- WARNING Zone: 500m (Default)
- WebSocket-Alerts an Player
- Cron: Alle 30 Sekunden

### Game Entity Erweiterungen
```typescript
boundaryViolationLimitSeconds: number // Default: 900 (15 Min)
proximityDangerMeters: number         // Default: 200
proximityWarningMeters: number        // Default: 500
```

### TrackingGateway Erweiterung
- `sendProximityAlert(participantId, data)` - WebSocket Proximity-Warnung

---

## ✅ Build Status (16.01.2026)

**Backend: ✅ RUNNING**
- Docker Container: manhunt-backend
- Port: 3000
- API Docs: http://localhost:3000/api/docs

**Neue Routes registriert:**
- `/api/uploads/capture-photo`
- `/api/uploads/handcuff-photo`  
- `/api/uploads/profile-photo`
- `/api/rules/jokers/*`

**Database Migrations:**
- ✅ `pings.metadata` (jsonb)
- ✅ `games.boundary_violation_limit_seconds`
- ✅ `games.proximity_danger_meters`
- ✅ `games.proximity_warning_meters`
- ✅ `captures.handcuff_applied`
- ✅ `captures.handcuff_photo_url`
- ✅ `captures.capture_photo_url`
- ✅ Neue Enum-Werte: CATCH_FREE, FAKE_PING, HOTEL_BONUS
- ✅ Neue EventTypes: BOUNDARY_WARNING, PLAYER_ELIMINATED, PLAYER_CAPTURED