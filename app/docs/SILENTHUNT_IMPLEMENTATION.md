# SILENTHUNT Implementation - Client-Side

## Übersicht

Die SILENTHUNT-Mechanik wurde von einer Backend-Scheduler-Lösung zu einer **Client-seitigen Implementierung** umgestellt. Die App übernimmt nun die komplette Verantwortung für:

1. Regelabfrage (innerZoneInterval, outerZoneInterval, radiusMeters)
2. Standort-Überwachung
3. Zonen-Erkennung (INNER_ZONE vs OUTER_ZONE)
4. Intervall-Berechnung basierend auf aktueller Zone
5. Automatisches Senden von SILENTHUNT Pings

## Neue Dateien

### `app/src/services/silenthunt.service.ts`
Zentraler Service für die SILENTHUNT-Logik:

- **`initialize(gameId, token)`**: Lädt Boundaries und Game Rules vom Backend
- **`getCurrentZone()`**: Bestimmt, ob Spieler in INNER_ZONE, OUTER_ZONE oder OUTSIDE ist
- **`getIntervalHours()`**: Gibt das Ping-Intervall basierend auf Zone zurück
- **`calculateNextPingTime()`**: Berechnet nächste Ping-Zeit
- **`updateLocation(location)`**: Aktualisiert Position und berechnet Zone neu
- **`shouldSendPing()`**: Prüft, ob Ping-Zeit erreicht ist
- **`sendPing(gameId)`**: Sendet SILENTHUNT Ping mit aktueller Position
- **`startTimer(gameId, onPingSent)`**: Startet automatischen Timer (prüft alle 30s)
- **`stopTimer()`**: Stoppt Timer

## Geänderte Dateien

### `app/src/components/SilenthuntStatusBar.tsx`
Komplett überarbeitet:

**Vorher:**
- Abfrage des Backend-Endpoints `/silenthunt/status`
- Backend berechnet nächste Ping-Zeit
- Nur Anzeige des Countdowns

**Nachher:**
- Initialisiert `silenthuntService`
- Überwacht Standort kontinuierlich (alle 30s oder 50m Bewegung)
- Zeigt aktuellen Countdown UND aktuelle Zone
- Startet automatischen Ping-Timer

## Ablauf

### 1. Initialisierung (beim App-Start)
```typescript
// In SilenthuntStatusBar useEffect
const initialized = await silenthuntService.initialize(gameId, token);
if (initialized) {
  silenthuntService.startTimer(gameId);
}
```

### 2. Standort-Überwachung
```typescript
const subscription = await Location.watchPositionAsync({
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 30000, // 30 Sekunden
  distanceInterval: 50, // 50 Meter
}, (location) => {
  silenthuntService.updateLocation(location);
});
```

### 3. Zonen-Erkennung
Die App verwendet den **Ray-Casting-Algorithmus**, um zu prüfen, ob ein Punkt innerhalb eines Polygons liegt:

```typescript
private isPointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  // Ray-casting algorithm
  // Prüft, wie oft ein Strahl vom Punkt nach außen die Polygon-Grenze schneidet
}
```

**Reihenfolge:**
1. Prüfe INNER_ZONE (höchste Priorität)
2. Dann OUTER_ZONE
3. Sonst OUTSIDE

### 4. Intervall-Anwendung
```typescript
// Beispiel aus Game Rule:
{
  "ruleType": "SILENTHUNT",
  "config": {
    "innerZoneIntervalHours": 1,  // Manhattan Zone: Jede Stunde
    "outerZoneIntervalHours": 2,   // Outer Area: Alle 2 Stunden
    "radiusMeters": 50
  }
}
```

### 5. Ping-Zeitberechnung
```typescript
// Wenn letzter Ping bekannt:
nextPing = lastPingTime + intervalHours

// Wenn kein letzter Ping:
// Rundet auf nächste Intervall-Grenze
// z.B. bei innerZoneInterval=1h:
//   - Jetzt: 14:37 → Nächster Ping: 15:00
//   - Jetzt: 15:02 → Nächster Ping: 16:00
```

### 6. Automatischer Ping-Versand
```typescript
// Timer prüft alle 30 Sekunden
setInterval(async () => {
  if (silenthuntService.shouldSendPing()) {
    const success = await silenthuntService.sendPing(gameId);
  }
}, 30000);
```

## API-Endpoints

### Boundaries abrufen
```
GET /api/tracking/hunter/:gameId/:token/boundaries
```
Gibt alle Zonen-Polygone zurück (INNER_ZONE, OUTER_ZONE, GAME_AREA)

### Game Rules abrufen
```
GET /api/tracking/hunter/:gameId/:token/rules
```
Gibt alle aktivierten Regeln inkl. SILENTHUNT-Config zurück

### Ping erstellen
```
POST /api/tracking/games/:gameId/ping
Body: {
  latitude: number,
  longitude: number,
  source: 'SILENTHUNT'
}
```

## UI-Anzeige

Die SilenthuntStatusBar zeigt jetzt:

```
🎯  Nächster Ping in  45 min
    🏙️ Innenzone
```

Oder:

```
🎯  Nächster Ping in  1h 23m
    🌆 Außenzone
```

**Zonen-Emojis:**
- 🏙️ = INNER_ZONE (Manhattan Zone)
- 🌆 = OUTER_ZONE (Outer Area)
- ❌ = OUTSIDE (außerhalb Spielgebiet)

## Fehlerbehandlung

### Spieler außerhalb des Spielgebiets
```typescript
if (zone === 'OUTSIDE') {
  console.log('[SilenthuntService] Player is outside game area, skipping ping');
  return false;
}
```

### Keine Location-Permission
Wenn der Spieler Location-Permission verweigert, wird kein Ping gesendet und die StatusBar zeigt nur den theoretischen Countdown.

### Backend nicht erreichbar
Wenn das Backend nicht erreichbar ist, kann die App nicht initialisieren und `enabled` bleibt `false`.

## Vorteile gegenüber Backend-Scheduler

### ✅ Vorteile
1. **Genauer**: Spieler-Position ist immer aktuell (nicht nur bei Backend-Check)
2. **Responsiv**: Sofortiges Feedback bei Zonen-Wechsel
3. **Offline-fähig**: Timer läuft auch wenn Backend kurz nicht erreichbar ist
4. **Weniger Server-Last**: Kein ständiges Polling aller Spieler im Backend
5. **Echtzeit-UI**: Spieler sieht genau, wann nächster Ping kommt

### ❌ Nachteile
1. **Client-abhängig**: Wenn App geschlossen oder abstürzt, keine Pings
2. **Battery-Drain**: Kontinuierliche Location-Überwachung verbraucht Akku
3. **Manipulierbar**: Spieler könnte theoretisch App-Code ändern (bei non-Store-Versionen)

## Zukunft: Background-Execution

Für produktiven Einsatz sollte Background-Execution implementiert werden:

```typescript
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

// Registriere Background-Task
TaskManager.defineTask('SILENTHUNT_PING', async () => {
  // Prüfe, ob Ping fällig ist
  // Sende Ping falls nötig
});

// Registriere alle 15 Minuten
await BackgroundFetch.registerTaskAsync('SILENTHUNT_PING', {
  minimumInterval: 15 * 60, // 15 Minuten
  stopOnTerminate: false,
  startOnBoot: true,
});
```

**Hinweis:** Background-Execution erfordert zusätzliche Permissions und funktioniert je nach OS (iOS/Android) unterschiedlich.

## Testing

### Manuelle Tests
1. App starten als Spieler
2. In INNER_ZONE bewegen → Countdown sollte kürzeres Intervall zeigen
3. In OUTER_ZONE bewegen → Countdown sollte längeres Intervall zeigen
4. Warten bis Countdown abläuft → Ping sollte automatisch gesendet werden
5. Hunter-Dashboard öffnen → SILENTHUNT Ping sollte erscheinen

### Debug-Logs
```typescript
// Aktiviere in silenthunt.service.ts
console.log('[SilenthuntService] Zone:', this.getCurrentZone());
console.log('[SilenthuntService] Interval:', this.getIntervalHours());
console.log('[SilenthuntService] Next ping:', this.getNextPingTime());
```

## Konfiguration

Die Regel wird im Backend (Orga-Dashboard) konfiguriert:

```typescript
{
  "ruleType": "SILENTHUNT",
  "isEnabled": true,
  "config": {
    "innerZoneIntervalHours": 1,    // Standard: 1 Stunde
    "outerZoneIntervalHours": 2,     // Standard: 2 Stunden
    "radiusMeters": 50               // Standard: 50 Meter
  }
}
```

## Migration vom Backend-Scheduler

### Was entfernt/deaktiviert werden muss:
- `backend/src/tracking/services/silenthunt-scheduler.service.ts` - Kann entfernt werden
- Cron-Job im Backend - Wird nicht mehr benötigt
- `/tracking/games/:gameId/silenthunt/status` Endpoint - Kann entfernt werden

### Was bleibt:
- `/tracking/hunter/:gameId/:token/boundaries` - Wird von App verwendet
- `/tracking/hunter/:gameId/:token/rules` - Wird von App verwendet
- `/tracking/games/:gameId/ping` - Wird für SILENTHUNT Pings verwendet

## Bekannte Einschränkungen

1. **App muss aktiv sein**: Im Moment werden nur Pings gesendet, wenn die App im Vordergrund läuft
2. **Battery Drain**: Kontinuierliche Location-Überwachung verbraucht Akku
3. **Genauigkeit**: Location-Genauigkeit kann je nach GPS-Signal variieren (50-100m)

## Nächste Schritte

1. ✅ Client-side Implementation
2. ⏳ Background-Execution implementieren
3. ⏳ Battery-Optimierung (adaptive Tracking-Intervalle)
4. ⏳ Offline-Queue für Pings (falls keine Netzwerkverbindung)
5. ⏳ Push-Notification wenn Ping fällig ist
