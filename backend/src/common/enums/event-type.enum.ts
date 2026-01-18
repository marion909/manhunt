export enum EventType {
  // Game events
  GAME_STARTED = 'game_started',
  GAME_PAUSED = 'game_paused',
  GAME_RESUMED = 'game_resumed',
  GAME_FINISHED = 'game_finished',

  // Position events
  POSITION_UPDATE = 'position_update',
  PING_GENERATED = 'ping_generated',

  // Capture events
  CAPTURE_ATTEMPT = 'capture_attempt',
  CAPTURE_CONFIRMED = 'capture_confirmed',
  CAPTURE_REJECTED = 'capture_rejected',

  // Violation events
  BOUNDARY_VIOLATION = 'boundary_violation',
  BOUNDARY_WARNING = 'boundary_warning',
  SPEED_VIOLATION = 'speed_violation',
  GPS_SPOOFING_DETECTED = 'gps_spoofing_detected',
  RULE_VIOLATION = 'rule_violation',

  // Player status events
  PLAYER_ELIMINATED = 'player_eliminated',
  PLAYER_CAPTURED = 'player_captured',

  // Admin events
  DISQUALIFICATION = 'disqualification',
  MANUAL_INTERVENTION = 'manual_intervention',
  POSITION_OVERRIDE = 'position_override',
  STATUS_OVERRIDE = 'status_override',

  // Emergency events
  PANIC_BUTTON = 'panic_button',
  EMERGENCY_STOP = 'emergency_stop',
}
