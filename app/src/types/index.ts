// Type definitions for MANHUNT mobile app
import { Point } from 'geojson';

export type Role = 'HUNTER' | 'PLAYER' | 'ORGA' | 'OPERATOR';

export type GameStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'FINISHED';

export type ParticipantStatus = 'ACTIVE' | 'CAPTURED' | 'DISQUALIFIED';

export type EventType =
  | 'CAPTURE'
  | 'BOUNDARY_VIOLATION'
  | 'EMERGENCY'
  | 'GAME_START'
  | 'GAME_END'
  | 'PARTICIPANT_JOIN'
  | 'PARTICIPANT_LEAVE';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Position {
  id: string;
  gameId: string;
  participantId: string;
  location: Point;
  timestamp: string;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  isEmergency: boolean;
  isOverride: boolean;
}

export interface Participant {
  id: string;
  gameId: string;
  userId?: string;
  role: Role;
  status: ParticipantStatus;
  joinedAt: string;
  fullName: string;
  email?: string;
}

export interface Game {
  id: string;
  name: string;
  status: GameStatus;
  huntingArea: any; // GeoJSON Polygon
  startedAt?: string;
  pausedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface GameEvent {
  id: string;
  gameId: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface Ping {
  id: string;
  gameId: string;
  userId: string;
  playerName: string;
  actualLocation: Point;
  displayLocation: Point;
  offsetDistance: number;
  createdAt: string;
}

export interface QRData {
  hostname: string;
  gameId: string;
  participantId: string;
  name: string;
  role: Role;
}

export interface AuthState {
  hostname: string;
  participantId: string;
  name: string;
  role: Role;
  gameId?: string;
  isAuthenticated: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}

export interface PositionUpdate extends LocationData {
  isEmergency?: boolean;
}
