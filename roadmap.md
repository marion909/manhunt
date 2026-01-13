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