import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { EventType } from '../common/enums/event-type.enum';
import { EventSeverity } from '../common/enums/event-severity.enum';

export interface CreateEventDto {
  gameId: string;
  userId?: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  /**
   * Log a new event
   */
  async logEvent(data: CreateEventDto): Promise<Event> {
    try {
      const event = this.eventRepository.create({
        gameId: data.gameId,
        userId: data.userId,
        eventType: data.type,
        severity: data.severity,
        metadata: data.metadata || {},
      });

      const savedEvent = await this.eventRepository.save(event);
      
      this.logger.log(
        `Event logged: [${data.severity}] ${data.type} - ${data.message} (Game: ${data.gameId})`,
      );

      return savedEvent;
    } catch (error) {
      this.logger.error(`Failed to log event: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all events for a game
   */
  async findByGame(
    gameId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ events: Event[]; total: number }> {
    const [events, total] = await this.eventRepository.findAndCount({
      where: { gameId },
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { events, total };
  }

  /**
   * Get events for a specific user in a game
   */
  async findByUserInGame(
    gameId: string,
    userId: string,
    limit = 50,
  ): Promise<Event[]> {
    return this.eventRepository.find({
      where: { gameId, userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get events by type
   */
  async findByType(
    gameId: string,
    type: EventType,
    limit = 50,
  ): Promise<Event[]> {
    return this.eventRepository.find({
      where: { gameId, eventType: type },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get events by severity
   */
  async findBySeverity(
    gameId: string,
    severity: EventSeverity,
    limit = 50,
  ): Promise<Event[]> {
    return this.eventRepository.find({
      where: { gameId, severity },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get critical events (warnings and errors)
   */
  async findCriticalEvents(gameId: string, limit = 50): Promise<Event[]> {
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.gameId = :gameId', { gameId })
      .andWhere('event.severity IN (:...severities)', {
        severities: [EventSeverity.WARNING, EventSeverity.CRITICAL],
      })
      .orderBy('event.timestamp', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Delete old events (cleanup)
   */
  async deleteOldEvents(daysToKeep = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.eventRepository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Deleted ${result.affected} events older than ${daysToKeep} days`);
    return result.affected || 0;
  }

  // Helper methods for common event types

  async logGameStart(gameId: string, userId: string): Promise<Event> {
    return this.logEvent({
      gameId,
      userId,
      type: EventType.GAME_STARTED,
      severity: EventSeverity.INFO,
      message: 'Game started',
    });
  }

  async logGamePause(gameId: string, userId: string): Promise<Event> {
    return this.logEvent({
      gameId,
      userId,
      type: EventType.GAME_PAUSED,
      severity: EventSeverity.INFO,
      message: 'Game paused',
    });
  }

  async logGameEnd(gameId: string, userId: string): Promise<Event> {
    return this.logEvent({
      gameId,
      userId,
      type: EventType.GAME_FINISHED,
      severity: EventSeverity.INFO,
      message: 'Game ended',
    });
  }

  async logCapture(
    gameId: string,
    hunterId: string,
    playerId: string,
    distance: number,
  ): Promise<Event> {
    return this.logEvent({
      gameId,
      userId: hunterId,
      type: EventType.CAPTURE_CONFIRMED,
      severity: EventSeverity.INFO,
      message: `Player captured`,
      metadata: { playerId, distance },
    });
  }

  async logBoundaryViolation(
    gameId: string,
    userId: string,
    location: { lat: number; lng: number },
  ): Promise<Event> {
    return this.logEvent({
      gameId,
      userId,
      type: EventType.BOUNDARY_VIOLATION,
      severity: EventSeverity.WARNING,
      message: 'Player left game boundary',
      metadata: { location },
    });
  }

  async logPanicButton(
    gameId: string,
    userId: string,
    location: { lat: number; lng: number },
  ): Promise<Event> {
    return this.logEvent({
      gameId,
      userId,
      type: EventType.PANIC_BUTTON,
      severity: EventSeverity.CRITICAL,
      message: 'Emergency alert triggered',
      metadata: { location },
    });
  }

  async logSuspiciousActivity(
    gameId: string,
    userId: string,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<Event> {
    return this.logEvent({
      gameId,
      userId,
      type: EventType.GPS_SPOOFING_DETECTED,
      severity: EventSeverity.WARNING,
      message: `Suspicious activity detected: ${reason}`,
      metadata,
    });
  }
}
