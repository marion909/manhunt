export enum ChatChannel {
  GLOBAL = 'GLOBAL',       // All participants (requires ORGA permission)
  HUNTERS = 'HUNTERS',     // Hunters + ORGA only
  PLAYERS = 'PLAYERS',     // Players only (requires game rule)
  ORGA = 'ORGA',           // ORGA/Operators only
  DIRECT = 'DIRECT',       // Direct messages (1:1)
}

export enum MessageType {
  TEXT = 'TEXT',
  SYSTEM = 'SYSTEM',
  VOICE_STARTED = 'VOICE_STARTED',
  VOICE_ENDED = 'VOICE_ENDED',
}
