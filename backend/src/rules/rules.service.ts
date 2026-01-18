import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThan } from 'typeorm';
import { GameRule, RuleType, RuleAction } from './entities/game-rule.entity';
import { ParticipantRuleState } from './entities/participant-rule-state.entity';
import { SpeedhuntSession, SpeedhuntStatus } from './entities/speedhunt-session.entity';
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
    @InjectRepository(ParticipantRuleState)
    private participantRuleStateRepository: Repository<ParticipantRuleState>,
    @InjectRepository(SpeedhuntSession)
    private speedhuntSessionRepository: Repository<SpeedhuntSession>,
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

  // ============================================
  // Participant Rule State Methods
  // ============================================

  /**
   * Get or create a participant rule state
   */
  async getOrCreateParticipantRuleState(
    participantId: string,
    ruleType: RuleType,
  ): Promise<ParticipantRuleState> {
    let state = await this.participantRuleStateRepository.findOne({
      where: { participantId, ruleType },
    });

    if (!state) {
      state = this.participantRuleStateRepository.create({
        participantId,
        ruleType,
        isAssigned: false,
        isActive: false,
        usageCount: 0,
      });
      state = await this.participantRuleStateRepository.save(state);
    }

    return state;
  }

  /**
   * Assign a rule to a participant (by Orga)
   */
  async assignRuleToParticipant(participantId: string, ruleType: RuleType): Promise<ParticipantRuleState> {
    const state = await this.getOrCreateParticipantRuleState(participantId, ruleType);
    state.isAssigned = true;
    return this.participantRuleStateRepository.save(state);
  }

  /**
   * Unassign a rule from a participant
   */
  async unassignRuleFromParticipant(participantId: string, ruleType: RuleType): Promise<void> {
    await this.participantRuleStateRepository.delete({ participantId, ruleType });
  }

  /**
   * Check if a participant has a rule assigned
   */
  async isRuleAssignedToParticipant(participantId: string, ruleType: RuleType): Promise<boolean> {
    const state = await this.participantRuleStateRepository.findOne({
      where: { participantId, ruleType, isAssigned: true },
    });
    return !!state;
  }

  /**
   * Get all rule states for a participant
   */
  async getParticipantRuleStates(participantId: string): Promise<ParticipantRuleState[]> {
    return this.participantRuleStateRepository.find({
      where: { participantId },
    });
  }

  /**
   * Get participants with a specific rule assigned
   */
  async getParticipantsWithRule(ruleType: RuleType): Promise<ParticipantRuleState[]> {
    return this.participantRuleStateRepository.find({
      where: { ruleType, isAssigned: true },
      relations: ['participant'],
    });
  }

  // ============================================
  // Regeneration Methods
  // ============================================

  /**
   * Check if a participant has active regeneration protection
   */
  async hasActiveRegeneration(participantId: string): Promise<boolean> {
    const now = new Date();
    const state = await this.participantRuleStateRepository.findOne({
      where: {
        participantId,
        ruleType: RuleType.REGENERATION,
        isActive: true,
        expiresAt: MoreThan(now),
      },
    });
    return !!state;
  }

  /**
   * Check if a participant has active Hotel Bonus protection
   */
  async hasActiveHotelBonus(participantId: string): Promise<boolean> {
    const now = new Date();
    const state = await this.participantRuleStateRepository.findOne({
      where: {
        participantId,
        ruleType: RuleType.HOTEL_BONUS,
        isActive: true,
        expiresAt: MoreThan(now),
      },
    });
    return !!state;
  }

  /**
   * Check if a participant has active Catch-Free protection
   */
  async hasActiveCatchFree(participantId: string): Promise<boolean> {
    const now = new Date();
    const state = await this.participantRuleStateRepository.findOne({
      where: {
        participantId,
        ruleType: RuleType.CATCH_FREE,
        isActive: true,
        expiresAt: MoreThan(now),
      },
    });
    return !!state;
  }

  /**
   * Activate regeneration for a participant
   */
  async activateRegeneration(
    participantId: string,
    durationMinutes: number,
  ): Promise<ParticipantRuleState> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.REGENERATION);

    if (!state.isAssigned) {
      throw new ForbiddenException('Regeneration is not assigned to this participant');
    }

    if (state.usageCount > 0) {
      throw new ForbiddenException('Regeneration has already been used');
    }

    const now = new Date();
    state.isActive = true;
    state.activatedAt = now;
    state.expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    state.usageCount = 1;

    return this.participantRuleStateRepository.save(state);
  }

  /**
   * Check and deactivate expired regenerations
   */
  async deactivateExpiredRegenerations(): Promise<number> {
    const now = new Date();
    const result = await this.participantRuleStateRepository.update(
      {
        ruleType: RuleType.REGENERATION,
        isActive: true,
        expiresAt: LessThanOrEqual(now),
      },
      { isActive: false },
    );
    return result.affected || 0;
  }

  // ============================================
  // Hunter Anfragen Methods
  // ============================================

  /**
   * Check if a participant has active hunter anfragen (not expired)
   */
  async hasActiveHunterAnfragen(participantId: string): Promise<boolean> {
    const state = await this.participantRuleStateRepository.findOne({
      where: {
        participantId,
        ruleType: RuleType.HUNTER_ANFRAGEN,
        isActive: true,
      },
    });
    
    if (!state) return false;
    
    // Check if expired
    if (state.expiresAt && new Date() > state.expiresAt) {
      // Deactivate expired state
      state.isActive = false;
      await this.participantRuleStateRepository.save(state);
      return false;
    }
    
    return true;
  }

  /**
   * Activate hunter anfragen for a participant (one-time use, expires after durationMinutes)
   */
  async activateHunterAnfragen(participantId: string, durationMinutes: number = 5): Promise<ParticipantRuleState> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.HUNTER_ANFRAGEN);

    if (!state.isAssigned) {
      throw new ForbiddenException('Hunter Anfragen is not assigned to this participant');
    }

    if (state.usageCount > 0) {
      throw new ForbiddenException('Hunter Anfragen has already been used');
    }

    const now = new Date();
    state.isActive = true;
    state.activatedAt = now;
    state.expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    state.usageCount = 1;

    return this.participantRuleStateRepository.save(state);
  }

  // ============================================
  // Catch-Free Methods (Rulebook: 3h capture immunity)
  // ============================================

  /**
   * Activate catch-free for a participant (Rulebook: 3 hours capture immunity)
   */
  async activateCatchFree(
    participantId: string,
    durationMinutes: number = 180, // Default 3 hours
  ): Promise<ParticipantRuleState> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.CATCH_FREE);

    if (!state.isAssigned) {
      throw new ForbiddenException('Catch-Free is not assigned to this participant');
    }

    if (state.usageCount > 0) {
      throw new ForbiddenException('Catch-Free has already been used');
    }

    const now = new Date();
    state.isActive = true;
    state.activatedAt = now;
    state.expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    state.usageCount = 1;

    return this.participantRuleStateRepository.save(state);
  }

  /**
   * Get catch-free status for a participant
   */
  async getCatchFreeStatus(participantId: string): Promise<{
    assigned: boolean;
    active: boolean;
    used: boolean;
    expiresAt?: Date;
    remainingMinutes?: number;
  }> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.CATCH_FREE);
    const now = new Date();
    const isActive = state.isActive && state.expiresAt && state.expiresAt > now;
    
    return {
      assigned: state.isAssigned,
      active: isActive,
      used: state.usageCount > 0,
      expiresAt: isActive ? state.expiresAt : undefined,
      remainingMinutes: isActive ? Math.floor((state.expiresAt.getTime() - now.getTime()) / 60000) : undefined,
    };
  }

  // ============================================
  // Fake-Ping Methods (Rulebook: Player can send false location)
  // ============================================

  /**
   * Check if a participant can use fake-ping
   */
  async canUseFakePing(participantId: string): Promise<boolean> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.FAKE_PING);
    return state.isAssigned && state.usageCount === 0;
  }

  /**
   * Mark fake-ping as used and store fake location (Rulebook: one-time false location ping)
   */
  async useFakePing(
    participantId: string,
    fakeLat?: number,
    fakeLng?: number,
  ): Promise<ParticipantRuleState> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.FAKE_PING);

    if (!state.isAssigned) {
      throw new ForbiddenException('Fake-Ping is not assigned to this participant');
    }

    if (state.usageCount > 0) {
      throw new ForbiddenException('Fake-Ping has already been used');
    }

    state.usageCount = 1;
    state.activatedAt = new Date();
    state.metadata = {
      ...state.metadata,
      used: true,
      usedAt: new Date(),
      fakeLocation: fakeLat && fakeLng ? { lat: fakeLat, lng: fakeLng } : null,
    };

    return this.participantRuleStateRepository.save(state);
  }

  // ============================================
  // Hotel-Bonus Methods (Rulebook: 6h ping protection, then auto-ping)
  // ============================================

  /**
   * Activate hotel bonus for a participant (Rulebook: 6 hours protection)
   */
  async activateHotelBonus(
    participantId: string,
    durationMinutes: number = 360, // Default 6 hours
  ): Promise<ParticipantRuleState> {
    const state = await this.getOrCreateParticipantRuleState(participantId, RuleType.HOTEL_BONUS);

    if (!state.isAssigned) {
      throw new ForbiddenException('Hotel-Bonus is not assigned to this participant');
    }

    if (state.usageCount > 0) {
      throw new ForbiddenException('Hotel-Bonus has already been used');
    }

    const now = new Date();
    state.isActive = true;
    state.activatedAt = now;
    state.expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    state.usageCount = 1;

    return this.participantRuleStateRepository.save(state);
  }

  /**
   * Get all expired hotel bonuses that need auto-ping for a specific game
   */
  async getExpiredHotelBonuses(gameId: string): Promise<ParticipantRuleState[]> {
    const now = new Date();
    return this.participantRuleStateRepository.find({
      where: {
        ruleType: RuleType.HOTEL_BONUS,
        isActive: true,
        expiresAt: LessThanOrEqual(now),
        participant: { gameId },
      },
      relations: ['participant'],
    });
  }

  /**
   * Deactivate expired hotel bonuses for a specific game
   */
  async deactivateExpiredHotelBonuses(gameId: string): Promise<number> {
    const now = new Date();
    
    // First get the expired bonuses for this game
    const expiredBonuses = await this.getExpiredHotelBonuses(gameId);
    
    if (expiredBonuses.length === 0) {
      return 0;
    }
    
    // Deactivate them
    const ids = expiredBonuses.map(b => b.id);
    const result = await this.participantRuleStateRepository.update(
      ids,
      { isActive: false },
    );
    return result.affected || 0;
  }

  // ============================================
  // Speedhunt Methods
  // ============================================

  /**
   * Get today's speedhunt usage for a hunter
   */
  async getHunterSpeedhuntUsageToday(hunterParticipantId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.speedhuntSessionRepository.count({
      where: {
        hunterParticipantId,
        startedAt: MoreThan(today),
      },
    });

    return count;
  }

  /**
   * Get active speedhunt for a hunter
   */
  async getActiveSpeedhunt(hunterParticipantId: string): Promise<SpeedhuntSession | null> {
    return this.speedhuntSessionRepository.findOne({
      where: {
        hunterParticipantId,
        status: SpeedhuntStatus.ACTIVE,
      },
      relations: ['target'],
    });
  }

  /**
   * Check if a target has an active speedhunt against them
   */
  async hasActiveSpeedhuntAgainst(targetParticipantId: string): Promise<boolean> {
    const session = await this.speedhuntSessionRepository.findOne({
      where: {
        targetParticipantId,
        status: SpeedhuntStatus.ACTIVE,
      },
    });
    return !!session;
  }

  /**
   * Get the last speedhunt target ID for consecutive target check
   */
  async getLastSpeedhuntTargetId(hunterParticipantId: string): Promise<string | null> {
    const lastSpeedhunt = await this.speedhuntSessionRepository.findOne({
      where: {
        hunterParticipantId,
        status: SpeedhuntStatus.COMPLETED,
      },
      order: { completedAt: 'DESC' },
    });

    return lastSpeedhunt?.targetParticipantId || null;
  }

  /**
   * Start a new speedhunt
   */
  async startSpeedhunt(
    gameId: string,
    hunterParticipantId: string,
    targetParticipantId: string,
    totalPings: number,
    maxSpeedhuntsPerDay: number,
    preventConsecutiveTarget: boolean = true,
  ): Promise<SpeedhuntSession> {
    // Check daily limit
    const usageToday = await this.getHunterSpeedhuntUsageToday(hunterParticipantId);
    if (usageToday >= maxSpeedhuntsPerDay) {
      throw new ForbiddenException('Daily speedhunt limit reached');
    }

    // Check if target has active protection (Regeneration, Hotel Bonus, or Catch-Free)
    const hasRegen = await this.hasActiveRegeneration(targetParticipantId);
    if (hasRegen) {
      throw new ForbiddenException('Target has active regeneration protection');
    }

    const hasHotelBonus = await this.hasActiveHotelBonus(targetParticipantId);
    if (hasHotelBonus) {
      throw new ForbiddenException('Target has active hotel bonus protection');
    }

    const hasCatchFree = await this.hasActiveCatchFree(targetParticipantId);
    if (hasCatchFree) {
      throw new ForbiddenException('Target has active catch-free protection');
    }

    // Check if hunter already has an active speedhunt
    const activeSpeedhunt = await this.getActiveSpeedhunt(hunterParticipantId);
    if (activeSpeedhunt) {
      throw new ForbiddenException('You already have an active speedhunt');
    }

    // Check consecutive target protection (Rulebook: same player cannot be targeted twice in a row)
    if (preventConsecutiveTarget) {
      const lastSpeedhunt = await this.speedhuntSessionRepository.findOne({
        where: {
          hunterParticipantId,
          status: SpeedhuntStatus.COMPLETED,
        },
        order: { completedAt: 'DESC' },
      });

      if (lastSpeedhunt && lastSpeedhunt.targetParticipantId === targetParticipantId) {
        throw new ForbiddenException('Cannot target the same player consecutively (Rulebook)');
      }
    }

    const session = this.speedhuntSessionRepository.create({
      gameId,
      hunterParticipantId,
      targetParticipantId,
      totalPings,
      usedPings: 0,
      status: SpeedhuntStatus.ACTIVE,
    });

    return this.speedhuntSessionRepository.save(session);
  }

  /**
   * Use a ping from an active speedhunt
   */
  async useSpeedhuntPing(speedhuntId: string): Promise<SpeedhuntSession> {
    const session = await this.speedhuntSessionRepository.findOne({
      where: { id: speedhuntId, status: SpeedhuntStatus.ACTIVE },
    });

    if (!session) {
      throw new NotFoundException('Active speedhunt not found');
    }

    if (session.usedPings >= session.totalPings) {
      throw new ForbiddenException('No pings remaining');
    }

    session.usedPings += 1;

    // Auto-complete if all pings used
    if (session.usedPings >= session.totalPings) {
      session.status = SpeedhuntStatus.COMPLETED;
      session.completedAt = new Date();
    }

    return this.speedhuntSessionRepository.save(session);
  }

  /**
   * Cancel an active speedhunt
   */
  async cancelSpeedhunt(speedhuntId: string): Promise<SpeedhuntSession> {
    const session = await this.speedhuntSessionRepository.findOne({
      where: { id: speedhuntId, status: SpeedhuntStatus.ACTIVE },
    });

    if (!session) {
      throw new NotFoundException('Active speedhunt not found');
    }

    session.status = SpeedhuntStatus.CANCELLED;
    session.completedAt = new Date();

    return this.speedhuntSessionRepository.save(session);
  }

  /**
   * Get all active speedhunts for a game
   */
  async getActiveSpeedhuntsForGame(gameId: string): Promise<SpeedhuntSession[]> {
    return this.speedhuntSessionRepository.find({
      where: { gameId, status: SpeedhuntStatus.ACTIVE },
      relations: ['target'],
    });
  }
}
