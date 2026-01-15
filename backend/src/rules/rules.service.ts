import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameRule, RuleType, RuleAction } from './entities/game-rule.entity';
import { Game } from '../games/entities/game.entity';
import { Position } from '../tracking/entities/position.entity';
import { EventsService } from '../events/events.service';
import { EventType, EventSeverity } from '../common/enums';

export interface CreateRuleDto {
  ruleType: RuleType;
  isEnabled?: boolean;
  config: Record<string, any>;
  action: RuleAction;
}

export interface UpdateRuleDto {
  isEnabled?: boolean;
  config?: Record<string, any>;
  action?: RuleAction;
}

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(GameRule)
    private rulesRepository: Repository<GameRule>,
    @InjectRepository(Game)
    private gamesRepository: Repository<Game>,
    private eventsService: EventsService,
  ) {}

  async createRule(gameId: string, dto: CreateRuleDto): Promise<GameRule> {
    const game = await this.gamesRepository.findOne({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }

    const rule = this.rulesRepository.create({
      gameId,
      ruleType: dto.ruleType,
      isEnabled: dto.isEnabled ?? true,
      config: dto.config,
      action: dto.action,
    });

    return this.rulesRepository.save(rule);
  }

  async getRules(gameId: string): Promise<GameRule[]> {
    return this.rulesRepository.find({
      where: { gameId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByGameAndType(gameId: string, ruleType: RuleType): Promise<GameRule | null> {
    return this.rulesRepository.findOne({
      where: { gameId, ruleType },
    });
  }

  async getRule(id: string): Promise<GameRule> {
    const rule = await this.rulesRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return rule;
  }

  async updateRule(id: string, dto: UpdateRuleDto): Promise<GameRule> {
    const rule = await this.getRule(id);

    if (dto.isEnabled !== undefined) {
      rule.isEnabled = dto.isEnabled;
    }
    if (dto.config) {
      rule.config = { ...rule.config, ...dto.config };
    }
    if (dto.action) {
      rule.action = dto.action;
    }

    return this.rulesRepository.save(rule);
  }

  async deleteRule(id: string): Promise<void> {
    const rule = await this.getRule(id);
    await this.rulesRepository.remove(rule);
  }

  /**
   * Evaluate all enabled rules for a position update
   */
  async evaluateRulesForPosition(
    gameId: string,
    userId: string,
    position: Position,
    game: Game,
  ): Promise<void> {
    const rules = await this.rulesRepository.find({
      where: { gameId, isEnabled: true },
    });

    for (const rule of rules) {
      await this.evaluateRule(rule, userId, position, game);
    }
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    rule: GameRule,
    userId: string,
    position: Position,
    game: Game,
  ): Promise<void> {
    let violated = false;
    let violationMessage = '';

    switch (rule.ruleType) {
      case RuleType.SPEED_LIMIT:
        violated = await this.checkSpeedLimit(userId, position, rule.config);
        violationMessage = `Speed limit exceeded (${rule.config.maxSpeed || 50} km/h)`;
        break;

      case RuleType.INACTIVITY:
        violated = await this.checkInactivity(userId, rule.config);
        violationMessage = `Inactivity detected (>${rule.config.maxInactiveMinutes || 30} minutes)`;
        break;

      case RuleType.NIGHT_MODE:
        violated = this.checkNightMode(game, rule.config);
        violationMessage = `Movement during night mode hours`;
        break;

      // BOUNDARY_VIOLATION is checked by geospatial service, not here
      default:
        return;
    }

    if (violated) {
      await this.handleViolation(rule, userId, game.id, violationMessage);
    }
  }

  /**
   * Check if speed limit is exceeded based on last two positions
   */
  private async checkSpeedLimit(
    userId: string,
    currentPosition: Position,
    config: Record<string, any>,
  ): Promise<boolean> {
    const maxSpeed = config.maxSpeed || 50; // km/h

    // Get previous position
    const positions = await this.rulesRepository.manager
      .getRepository(Position)
      .find({
        where: { participantId: userId, gameId: currentPosition.gameId },
        order: { timestamp: 'DESC' },
        take: 2, // Get latest 2 positions
      });

    const prevPosition = positions[1]; // Second position is the previous one

    if (!prevPosition) {
      return false; // No previous position to compare
    }

    // Calculate speed between positions
    const timeDiff = (currentPosition.timestamp.getTime() - prevPosition.timestamp.getTime()) / 1000 / 3600; // hours
    
    if (timeDiff === 0) {
      return false;
    }

    // Use ST_Distance for accurate distance calculation
    const result = await this.rulesRepository.manager.query(
      `SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) as distance`,
      [
        currentPosition.location.coordinates[0],
        currentPosition.location.coordinates[1],
        prevPosition.location.coordinates[0],
        prevPosition.location.coordinates[1],
      ],
    );

    const distanceMeters = result[0]?.distance || 0;
    const distanceKm = distanceMeters / 1000;
    const speed = distanceKm / timeDiff; // km/h

    return speed > maxSpeed;
  }

  /**
   * Check if user has been inactive
   */
  private async checkInactivity(userId: string, config: Record<string, any>): Promise<boolean> {
    const maxInactiveMinutes = config.maxInactiveMinutes || 30;

    const lastPosition = await this.rulesRepository.manager
      .getRepository(Position)
      .findOne({
        where: { participantId: userId },
        order: { timestamp: 'DESC' },
      });

    if (!lastPosition) {
      return false;
    }

    const inactiveMinutes = (Date.now() - lastPosition.timestamp.getTime()) / 1000 / 60;
    return inactiveMinutes > maxInactiveMinutes;
  }

  /**
   * Check if movement is during night mode hours
   */
  private checkNightMode(game: Game, config: Record<string, any>): boolean {
    if (!game.nightModeEnabled) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const startHour = game.nightStartHour;
    const endHour = game.nightEndHour;

    // Check if current time is within night mode hours
    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Night mode crosses midnight
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  /**
   * Handle a rule violation based on the action configured
   */
  private async handleViolation(
    rule: GameRule,
    userId: string,
    gameId: string,
    message: string,
  ): Promise<void> {
    const severity =
      rule.action === RuleAction.DISQUALIFY
        ? EventSeverity.CRITICAL
        : rule.action === RuleAction.WARN
        ? EventSeverity.WARNING
        : EventSeverity.INFO;

    await this.eventsService.logEvent({
      gameId,
      userId,
      type: EventType.RULE_VIOLATION,
      severity,
      message,
      metadata: {
        ruleId: rule.id,
        ruleType: rule.ruleType,
        message,
        action: rule.action,
      },
    });

    // If action is DISQUALIFY, update participant status
    if (rule.action === RuleAction.DISQUALIFY) {
      // This would be handled by GameParticipantsService
      // For now, just log the violation
    }
  }
}
