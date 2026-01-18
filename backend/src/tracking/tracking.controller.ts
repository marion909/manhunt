import { Controller, Get, Post, Body, Param, Query, UseGuards, UnauthorizedException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { PositionUpdateDto } from './dto/position-update.dto';
import { PanicRequestDto } from './dto/panic-request.dto';
import { OverridePositionDto } from './dto/override-position.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { GamesService } from '../games/games.service';
import { RulesService } from '../rules/rules.service';
import { RuleType } from '../rules/entities/game-rule.entity';
import { Role } from '../common/enums/role.enum';
import { Point } from 'geojson';
import { PingSource } from './entities/ping.entity';
import { TrackingGateway } from './tracking.gateway';

@ApiTags('tracking')
@Controller('tracking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);
  
  constructor(
    private readonly trackingService: TrackingService,
    private readonly gamesService: GamesService,
    private readonly rulesService: RulesService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly trackingGateway: TrackingGateway,
  ) {}

  @Post('games/:gameId/position')
  @ApiOperation({ summary: 'Update position (REST fallback)' })
  @ApiResponse({ status: 201, description: 'Position saved' })
  async updatePosition(
    @Param('gameId') gameId: string,
    @Body() positionDto: PositionUpdateDto,
    @CurrentUser() user: any,
  ) {
    return this.trackingService.savePosition(gameId, user.userId, positionDto);
  }

  @Post('games/:gameId/ping')
  @ApiOperation({ summary: 'Create a periodic ping (REST fallback for 10s timer)' })
  @ApiResponse({ status: 201, description: 'Ping created' })
  async createPing(
    @Param('gameId') gameId: string,
    @Body() body: { latitude: number; longitude: number; source?: PingSource },
    @CurrentUser() user: any,
  ) {
    // Use participantId from token (mobile app) or find by userId (web app)
    let participantId = user.participantId;
    
    if (!participantId && user.userId) {
      // Fallback: find participant by userId for web users
      const participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
      if (!participant) {
        throw new ForbiddenException('Not a participant in this game');
      }
      participantId = participant.id;
    }
    
    if (!participantId) {
      throw new ForbiddenException('Not a participant in this game');
    }

    // First save the position
    await this.trackingService.savePosition(gameId, participantId, {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: 0,
    });

    // Then create the ping
    const source = body.source || PingSource.PERIODIC;
    const ping = await this.trackingService.generatePing(gameId, participantId, 0, 0, source);

    // Broadcast the ping via WebSocket
    if (ping) {
      this.logger.log(`[createPing] Broadcasting ${source} ping ${ping.id} for participant ${participant.id}`);
      this.trackingGateway.broadcastPing(gameId, ping);
    }

    return {
      success: true,
      pingId: ping?.id,
      timestamp: ping?.timestamp,
      source,
    };
  }

  @Get('games/:gameId/hunters')
  @ApiOperation({ summary: 'Get current hunter positions' })
  @ApiResponse({ status: 200, description: 'Hunter positions retrieved' })
  async getHunterPositions(@Param('gameId') gameId: string) {
    return this.trackingService.getHunterPositions(gameId);
  }

  @Get('games/:gameId/pings')
  @ApiOperation({ summary: 'Get recent player pings' })
  @ApiQuery({ name: 'sources', required: false, description: 'Comma-separated ping sources' })
  @ApiQuery({ name: 'roles', required: false, description: 'Comma-separated roles to filter' })
  @ApiQuery({ name: 'includeFake', required: false, description: 'Include fake pings (default: true)' })
  @ApiResponse({ status: 200, description: 'Pings retrieved' })
  async getPings(
    @Param('gameId') gameId: string,
    @Query('sources') sources?: string,
    @Query('roles') roles?: string,
    @Query('includeFake') includeFake?: string,
  ) {
    const options = {
      sources: sources ? sources.split(',') as PingSource[] : undefined,
      roles: roles ? roles.split(',') : undefined,
      includeFake: includeFake !== 'false',
    };

    const pings = await this.trackingService.getPlayerPingsFiltered(gameId, options);
    // Transform to match frontend expectations
    return pings.map((ping) => ({
      id: ping.id,
      gameId: ping.gameId,
      participantId: ping.participantId,
      playerName: ping.participant?.displayName || 'Unknown',
      role: ping.participant?.role?.toUpperCase() || 'UNKNOWN',
      actualLocation: ping.actualLocation,
      displayLocation: ping.revealedLocation,
      offsetDistance: ping.radiusMeters,
      createdAt: ping.timestamp.toISOString(),
      source: ping.source,
      isFake: ping.isFake,
    }));
  }

  @Get('games/:gameId/history/:participantId')
  @ApiOperation({ summary: 'Get position history for participant' })
  @ApiResponse({ status: 200, description: 'Position history retrieved' })
  async getHistory(@Param('gameId') gameId: string, @Param('participantId') participantId: string) {
    return this.trackingService.getPositionHistory(gameId, participantId, 100);
  }

  @Post('panic')
  @ApiOperation({ summary: 'Trigger panic alert (PLAYER only)' })
  @ApiResponse({ status: 201, description: 'Panic alert triggered' })
  @ApiResponse({ status: 403, description: 'Only players can trigger panic' })
  async triggerPanic(@Body() panicDto: PanicRequestDto, @CurrentUser() user: any) {
    const location: Point = {
      type: 'Point',
      coordinates: panicDto.location.coordinates,
    };
    return this.trackingService.triggerPanic(panicDto.gameId, user.userId, location);
  }

  @Post('games/:gameId/override-position')
  @ApiOperation({ summary: 'Override player position (ORGA/OPERATOR only)' })
  @ApiResponse({ status: 201, description: 'Position overridden successfully' })
  @ApiResponse({ status: 403, description: 'Only ORGA/OPERATOR can override positions' })
  async overridePosition(
    @Param('gameId') gameId: string,
    @Body() dto: OverridePositionDto,
    @CurrentUser() user: any,
  ) {
    return this.trackingService.overridePosition(
      gameId,
      dto.userId,
      dto.location,
      user.userId,
    );
  }

  // ============================================
  // PUBLIC HUNTER DASHBOARD ENDPOINTS
  // ============================================

  @Get('hunter/:gameId/:token/hunters')
  @Public()
  @ApiOperation({ summary: 'Get hunter positions (public with token)' })
  @ApiResponse({ status: 200, description: 'Hunter positions retrieved' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async getHunterPositionsPublic(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
  ) {
    const isValid = await this.gamesService.validateHunterToken(gameId, token);
    if (!isValid.valid) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }
    return this.trackingService.getHunterPositions(gameId);
  }

  @Get('hunter/:gameId/:token/pings')
  @Public()
  @ApiOperation({ summary: 'Get player pings with filters (public with token)' })
  @ApiQuery({ name: 'participantIds', required: false, description: 'Comma-separated participant IDs to filter' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO timestamp to filter pings after' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max number of pings to return' })
  @ApiQuery({ name: 'sources', required: false, description: 'Comma-separated ping sources (PERIODIC,SPEEDHUNT,SILENTHUNT,FAKE_PING,MANUAL)' })
  @ApiQuery({ name: 'roles', required: false, description: 'Comma-separated roles to filter (hunter,player)' })
  @ApiQuery({ name: 'includeFake', required: false, description: 'Include fake pings (default: true)' })
  @ApiResponse({ status: 200, description: 'Pings retrieved' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async getPingsPublic(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
    @Query('participantIds') participantIds?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
    @Query('sources') sources?: string,
    @Query('roles') roles?: string,
    @Query('includeFake') includeFake?: string,
  ) {
    const isValid = await this.gamesService.validateHunterToken(gameId, token);
    if (!isValid.valid) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }

    const options = {
      participantIds: participantIds ? participantIds.split(',') : undefined,
      since: since ? new Date(since) : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      sources: sources ? sources.split(',') as PingSource[] : undefined,
      roles: roles ? roles.split(',') : undefined,
      includeFake: includeFake !== 'false',
    };

    const pings = await this.trackingService.getPlayerPingsFiltered(gameId, options);
    return pings.map((ping) => ({
      id: ping.id,
      gameId: ping.gameId,
      participantId: ping.participantId,
      playerName: ping.participant?.displayName || 'Unknown',
      role: ping.participant?.role?.toUpperCase() || 'UNKNOWN',
      actualLocation: ping.actualLocation,
      displayLocation: ping.revealedLocation,
      offsetDistance: ping.radiusMeters,
      createdAt: ping.timestamp.toISOString(),
      source: ping.source,
      isFake: ping.isFake,
    }));
  }

  @Get('hunter/:gameId/:token/boundaries')
  @Public()
  @ApiOperation({ summary: 'Get game boundaries (public with token)' })
  @ApiResponse({ status: 200, description: 'Boundaries retrieved' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async getBoundariesPublic(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
  ) {
    const result = await this.gamesService.validateHunterToken(gameId, token);
    if (!result.valid || !result.game) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }
    return result.game.boundaries || [];
  }

  @Get('hunter/:gameId/:token/rules')
  @Public()
  @ApiOperation({ summary: 'Get enabled game rules (public with token)' })
  @ApiResponse({ status: 200, description: 'Rules retrieved' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async getRulesPublic(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
  ) {
    const isValid = await this.gamesService.validateHunterToken(gameId, token);
    if (!isValid.valid) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }
    
    const rules = await this.rulesService.getRules(gameId);
    return rules.map(rule => ({
      id: rule.id,
      ruleType: rule.ruleType,
      isEnabled: rule.isEnabled,
      config: rule.config,
    }));
  }

  // ============================================
  // PLAYER ENDPOINTS FOR SILENTHUNT
  // ============================================

  @Get('games/:gameId/player/boundaries')
  @Public()
  @ApiOperation({ summary: 'Get game boundaries (authenticated player)' })
  @ApiResponse({ status: 200, description: 'Boundaries retrieved' })
  async getPlayerBoundaries(
    @Param('gameId') gameId: string,
  ) {
    const game = await this.gamesService.findGameWithBoundaries(gameId);
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game.boundaries || [];
  }

  @Get('games/:gameId/player/rules')
  @Public()
  @ApiOperation({ summary: 'Get enabled game rules (authenticated player)' })
  @ApiResponse({ status: 200, description: 'Rules retrieved' })
  async getPlayerRules(
    @Param('gameId') gameId: string,
  ) {
    const rules = await this.rulesService.getRules(gameId);
    return rules.map(rule => ({
      id: rule.id,
      ruleType: rule.ruleType,
      isEnabled: rule.isEnabled,
      config: rule.config,
    }));
  }

  // ============================================
  // REGENERATION ENDPOINTS
  // ============================================

  @Post('games/:gameId/regeneration/activate')
  @ApiOperation({ summary: 'Activate regeneration protection (PLAYER only)' })
  @ApiResponse({ status: 201, description: 'Regeneration activated' })
  @ApiResponse({ status: 403, description: 'Not allowed or already used' })
  async activateRegeneration(
    @Param('gameId') gameId: string,
    @CurrentUser() user: any,
  ) {
    // Get participant
    const participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
    if (!participant || participant.role !== Role.PLAYER) {
      throw new ForbiddenException('Only players can activate regeneration');
    }

    // Get regeneration rule config
    const rule = await this.rulesService.findByGameAndType(gameId, RuleType.REGENERATION);
    if (!rule || !rule.isEnabled) {
      throw new ForbiddenException('Regeneration rule is not enabled for this game');
    }

    const durationMinutes = rule.config?.durationMinutes || 60;

    const state = await this.rulesService.activateRegeneration(participant.id, durationMinutes);
    
    return {
      success: true,
      message: 'Regeneration activated',
      expiresAt: state.expiresAt,
      durationMinutes,
    };
  }

  @Get('games/:gameId/regeneration/status')
  @ApiOperation({ summary: 'Get regeneration status for current player' })
  @ApiResponse({ status: 200, description: 'Regeneration status' })
  async getRegenerationStatus(
    @Param('gameId') gameId: string,
    @CurrentUser() user: any,
  ) {
    const participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
    if (!participant) {
      throw new ForbiddenException('Not a participant in this game');
    }

    const states = await this.rulesService.getParticipantRuleStates(participant.id);
    const regenState = states.find(s => s.ruleType === RuleType.REGENERATION);

    if (!regenState || !regenState.isAssigned) {
      return { assigned: false, active: false, used: false };
    }

    const now = new Date();
    const isExpired = regenState.expiresAt && regenState.expiresAt < now;

    return {
      assigned: regenState.isAssigned,
      active: regenState.isActive && !isExpired,
      used: regenState.usageCount > 0,
      activatedAt: regenState.activatedAt,
      expiresAt: regenState.expiresAt,
      remainingMs: regenState.expiresAt && !isExpired 
        ? regenState.expiresAt.getTime() - now.getTime() 
        : 0,
    };
  }

  // ============================================
  // SILENTHUNT STATUS ENDPOINT
  // ============================================

  @Get('games/:gameId/silenthunt/status')
  @Public()
  @ApiOperation({ summary: 'Get Silenthunt status and next ping time for a player' })
  @ApiResponse({ status: 200, description: 'Silenthunt status retrieved' })
  async getSilenthuntStatus(
    @Param('gameId') gameId: string,
    @Query('participantId') queryParticipantId: string,
  ) {
    if (!queryParticipantId) {
      throw new ForbiddenException('participantId is required');
    }

    // Check if SILENTHUNT rule is enabled
    const silenthuntRule = await this.rulesService.findByGameAndType(gameId, RuleType.SILENTHUNT);
    if (!silenthuntRule || !silenthuntRule.isEnabled) {
      return {
        enabled: false,
      };
    }

    const config = silenthuntRule.config || {};
    const innerZoneIntervalHours = config.innerZoneIntervalHours || 1; // Manhattan Zone: 1h (Rulebook)
    const outerZoneIntervalHours = config.outerZoneIntervalHours || 2; // Outer Area: 2h (Rulebook)

    // Get current hour
    const now = new Date();
    const currentHour = now.getHours();

    // Calculate next ping hour for inner zone (worst case, more frequent)
    const nextInnerPingHour = Math.ceil((currentHour + 1) / innerZoneIntervalHours) * innerZoneIntervalHours;
    const nextOuterPingHour = Math.ceil((currentHour + 1) / outerZoneIntervalHours) * outerZoneIntervalHours;

    // Calculate next ping time (inner zone - more frequent)
    const nextPingDate = new Date(now);
    nextPingDate.setHours(nextInnerPingHour % 24, 0, 0, 0);
    if (nextInnerPingHour >= 24) {
      nextPingDate.setDate(nextPingDate.getDate() + 1);
    }

    const remainingMs = nextPingDate.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);

    return {
      enabled: true,
      innerZoneIntervalHours,
      outerZoneIntervalHours,
      nextPingAt: nextPingDate.toISOString(),
      remainingMinutes,
      currentHour,
    };
  }

  @Post('games/:gameId/silenthunt/trigger')
  @Public()
  @ApiOperation({ summary: 'Manually trigger Silenthunt ping generation (TEST ONLY)' })
  @ApiResponse({ status: 200, description: 'Silenthunt pings generated' })
  async triggerSilenthunt(@Param('gameId') gameId: string) {
    // Import SilenthuntSchedulerService via the service
    const currentHour = new Date().getHours();
    this.logger.log(`[TEST] Manual Silenthunt trigger for game ${gameId} at hour ${currentHour}`);
    
    // Get game and check if active
    const game = await this.gamesService.findOne(gameId, null);
    if (!game || game.status !== 'ACTIVE') {
      throw new ForbiddenException('Game is not active');
    }

    // Check if SILENTHUNT rule is enabled
    const silenthuntRule = await this.rulesService.findByGameAndType(gameId, RuleType.SILENTHUNT);
    if (!silenthuntRule || !silenthuntRule.isEnabled) {
      throw new ForbiddenException('SILENTHUNT rule is not enabled');
    }

    const config = silenthuntRule.config || {};
    const pingRadius = config.pingRadius || 100;

    // Get all active players
    const players = game.participants.filter(
      (p) => p.role === 'PLAYER' && p.status === 'ACTIVE',
    );

    const pings = [];
    for (const player of players) {
      try {
        const ping = await this.trackingService.generatePing(
          gameId,
          player.id,
          pingRadius,
          0,
          PingSource.SILENTHUNT,
        );
        
        if (ping) {
          this.trackingGateway.broadcastPing(gameId, ping);
          pings.push({ playerId: player.id, playerName: player.displayName, pingId: ping.id });
          this.logger.log(`[TEST] Generated SILENTHUNT ping for player ${player.displayName}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to generate ping for player ${player.id}: ${errorMessage}`);
      }
    }

    return {
      success: true,
      gameId,
      currentHour,
      pingsGenerated: pings.length,
      pings,
    };
  }

  // ============================================
  // HUNTER ANFRAGEN ENDPOINTS
  // ============================================

  @Post('games/:gameId/hunter-anfragen/activate')
  @Public()
  @ApiOperation({ summary: 'Activate hunter position view (PLAYER only, one-time)' })
  @ApiResponse({ status: 201, description: 'Hunter Anfragen activated' })
  @ApiResponse({ status: 403, description: 'Not allowed or already used' })
  async activateHunterAnfragen(
    @Param('gameId') gameId: string,
    @Body() body: { participantId?: string },
    @CurrentUser() user: any,
  ) {
    // Support both JWT auth (web) and participantId in body (mobile app)
    let participant;
    
    if (body?.participantId) {
      // Mobile app provides participantId directly
      participant = await this.gamesService.getParticipantById(body.participantId);
      if (!participant || participant.gameId !== gameId) {
        throw new ForbiddenException('Invalid participant');
      }
    } else if (user?.userId) {
      // Web app - lookup by userId
      participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
    }
    
    if (!participant) {
      throw new ForbiddenException('Participant not found');
    }
    
    if (participant.role !== Role.PLAYER) {
      throw new ForbiddenException('Only players can activate Hunter Anfragen');
    }

    const rule = await this.rulesService.findByGameAndType(gameId, RuleType.HUNTER_ANFRAGEN);
    if (!rule || !rule.isEnabled) {
      throw new ForbiddenException('Hunter Anfragen rule is not enabled for this game');
    }

    const durationMinutes = rule.config?.durationMinutes || 5;
    const state = await this.rulesService.activateHunterAnfragen(participant.id, durationMinutes);
    
    // Return current hunter positions
    const hunterPositions = await this.trackingService.getHunterPositions(gameId);
    
    return {
      success: true,
      message: 'Hunter Anfragen activated - you can now see hunter positions',
      activatedAt: state.activatedAt,
      expiresAt: state.expiresAt?.toISOString(),
      hunterPositions,
    };
  }

  @Get('games/:gameId/hunter-anfragen/status')
  @Public()
  @ApiOperation({ summary: 'Get Hunter Anfragen status and positions if active' })
  @ApiResponse({ status: 200, description: 'Hunter Anfragen status' })
  async getHunterAnfragenStatus(
    @Param('gameId') gameId: string,
    @Query('participantId') queryParticipantId: string,
    @CurrentUser() user: any,
  ) {
    // Support both JWT auth (web) and participantId query param (mobile app)
    let participantId: string;
    
    if (queryParticipantId) {
      // Mobile app provides participantId directly
      participantId = queryParticipantId;
    } else if (user?.userId) {
      // Web app - lookup by userId
      const participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
      if (!participant) {
        throw new ForbiddenException('Not a participant in this game');
      }
      participantId = participant.id;
    } else {
      throw new ForbiddenException('No participant identification provided');
    }

    // First check if HUNTER_ANFRAGEN rule is enabled for this game
    const rule = await this.rulesService.findByGameAndType(gameId, RuleType.HUNTER_ANFRAGEN);
    if (!rule || !rule.isEnabled) {
      // Rule not enabled - not assigned
      return {
        isAssigned: false,
        isActive: false,
        usageCount: 0,
      };
    }

    // Rule is enabled - check participant's state
    const hasActive = await this.rulesService.hasActiveHunterAnfragen(participantId);
    
    if (hasActive) {
      const state = await this.rulesService.getOrCreateParticipantRuleState(participantId, RuleType.HUNTER_ANFRAGEN);
      const hunterPositions = await this.trackingService.getHunterPositions(gameId);
      return {
        isAssigned: true,
        isActive: true,
        expiresAt: state.expiresAt?.toISOString(),
        usageCount: state.usageCount,
        hunterPositions,
      };
    }

    // Get or create state - if rule is enabled, participant is effectively assigned
    const state = await this.rulesService.getOrCreateParticipantRuleState(participantId, RuleType.HUNTER_ANFRAGEN);
    
    // Auto-assign if rule is enabled
    if (!state.isAssigned) {
      state.isAssigned = true;
      await this.rulesService.assignRuleToParticipant(participantId, RuleType.HUNTER_ANFRAGEN);
    }

    return {
      isAssigned: true,
      isActive: false,
      usageCount: state.usageCount,
      expiresAt: state.expiresAt?.toISOString(),
    };
  }

  @Get('games/:gameId/hunter-positions')
  @Public()
  @ApiOperation({ summary: 'Get hunter positions (only for players with active Hunter Anfragen)' })
  @ApiResponse({ status: 200, description: 'Hunter positions retrieved' })
  @ApiResponse({ status: 403, description: 'No active Hunter Anfragen' })
  async getHunterPositionsForPlayer(
    @Param('gameId') gameId: string,
    @Query('participantId') queryParticipantId: string,
    @CurrentUser() user: any,
  ) {
    // Support both JWT auth (web) and participantId query param (mobile app)
    let participantId: string;
    
    if (queryParticipantId) {
      participantId = queryParticipantId;
    } else if (user?.userId) {
      const participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
      if (!participant) {
        throw new ForbiddenException('Not a participant in this game');
      }
      participantId = participant.id;
    } else {
      throw new ForbiddenException('No participant identification provided');
    }

    const hasActive = await this.rulesService.hasActiveHunterAnfragen(participantId);
    if (!hasActive) {
      throw new ForbiddenException('You do not have an active Hunter Anfragen');
    }

    return this.trackingService.getHunterPositions(gameId);
  }

  @Get('games/:gameId/hunter-anfragen/game-info')
  @Public()
  @ApiOperation({ summary: 'Get game info (center, boundaries) for Hunter Anfragen map' })
  @ApiResponse({ status: 200, description: 'Game info retrieved' })
  async getGameInfoForHunterAnfragen(
    @Param('gameId') gameId: string,
    @Query('participantId') queryParticipantId: string,
    @CurrentUser() user: any,
  ) {
    // Support both JWT auth (web) and participantId query param (mobile app)
    let participantId: string;
    
    if (queryParticipantId) {
      participantId = queryParticipantId;
    } else if (user?.userId) {
      const participant = await this.gamesService.findParticipantByUserId(gameId, user.userId);
      if (!participant) {
        throw new ForbiddenException('Not a participant in this game');
      }
      participantId = participant.id;
    } else {
      throw new ForbiddenException('No participant identification provided');
    }

    // Verify player has active Hunter Anfragen
    const hasActive = await this.rulesService.hasActiveHunterAnfragen(participantId);
    if (!hasActive) {
      throw new ForbiddenException('You do not have an active Hunter Anfragen');
    }

    // Get game with boundaries
    const game = await this.gamesService.findGameWithBoundaries(gameId);
    if (!game) {
      throw new ForbiddenException('Game not found');
    }

    return {
      centerPoint: game.centerPoint,
      boundaries: game.boundaries?.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        geometry: b.geometry,
        active: b.active,
      })) || [],
    };
  }

  // ============================================
  // PLAYER APP ENDPOINTS (for players to see map)
  // ============================================

  @Get('games/:gameId/player-app/game-info')
  @Public()
  @ApiOperation({ summary: 'Get game info for player app (center, boundaries)' })
  @ApiResponse({ status: 200, description: 'Game info retrieved' })
  @ApiResponse({ status: 403, description: 'Not a player' })
  async getGameInfoForPlayerApp(
    @Param('gameId') gameId: string,
    @Query('participantId') participantId: string,
  ) {
    if (!participantId) {
      throw new ForbiddenException('Participant ID required');
    }

    // Verify this is a player
    const role = await this.gamesService.getParticipantRole(gameId, participantId);
    if (role !== Role.PLAYER) {
      throw new ForbiddenException('Only players can access this endpoint');
    }

    // Get game with boundaries
    const game = await this.gamesService.findGameWithBoundaries(gameId);
    if (!game) {
      throw new ForbiddenException('Game not found');
    }

    return {
      centerPoint: game.centerPoint,
      boundaries: game.boundaries?.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        geometry: b.geometry,
        active: b.active,
      })) || [],
    };
  }

  // ============================================
  // HUNTER APP ENDPOINTS (for hunters to see map)
  // ============================================

  @Get('games/:gameId/hunter-app/game-info')
  @Public()
  @ApiOperation({ summary: 'Get game info for hunter app (center, boundaries)' })
  @ApiResponse({ status: 200, description: 'Game info retrieved' })
  @ApiResponse({ status: 403, description: 'Not a hunter' })
  async getGameInfoForHunterApp(
    @Param('gameId') gameId: string,
    @Query('participantId') participantId: string,
  ) {
    if (!participantId) {
      throw new ForbiddenException('Participant ID required');
    }

    // Verify this is a hunter
    const role = await this.gamesService.getParticipantRole(gameId, participantId);
    if (role !== Role.HUNTER) {
      throw new ForbiddenException('Only hunters can access this endpoint');
    }

    // Get game with boundaries
    const game = await this.gamesService.findGameWithBoundaries(gameId);
    if (!game) {
      throw new ForbiddenException('Game not found');
    }

    return {
      centerPoint: game.centerPoint,
      boundaries: game.boundaries?.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        geometry: b.geometry,
        active: b.active,
      })) || [],
    };
  }

  @Get('games/:gameId/hunter-app/other-hunters')
  @Public()
  @ApiOperation({ summary: 'Get positions of other hunters for hunter app' })
  @ApiResponse({ status: 200, description: 'Hunter positions retrieved' })
  @ApiResponse({ status: 403, description: 'Not a hunter' })
  async getOtherHuntersForHunterApp(
    @Param('gameId') gameId: string,
    @Query('participantId') participantId: string,
  ) {
    if (!participantId) {
      throw new ForbiddenException('Participant ID required');
    }

    // Verify this is a hunter
    const role = await this.gamesService.getParticipantRole(gameId, participantId);
    if (role !== Role.HUNTER) {
      throw new ForbiddenException('Only hunters can access this endpoint');
    }

    // Get all hunter positions (the app will filter out the current hunter)
    return this.trackingService.getHunterPositions(gameId);
  }

  @Get('games/:gameId/hunter-app/pings')
  @Public()
  @ApiOperation({ summary: 'Get player pings for hunter app with filters' })
  @ApiResponse({ status: 200, description: 'Pings retrieved' })
  @ApiResponse({ status: 403, description: 'Not a hunter' })
  @ApiQuery({ name: 'participantId', required: true, description: 'Hunter participant ID' })
  @ApiQuery({ name: 'playerIds', required: false, description: 'Filter by player IDs (comma-separated)' })
  @ApiQuery({ name: 'since', required: false, description: 'Filter pings since this ISO date' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max number of pings (default 200)' })
  async getPingsForHunterApp(
    @Param('gameId') gameId: string,
    @Query('participantId') participantId: string,
    @Query('playerIds') playerIds?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    if (!participantId) {
      throw new ForbiddenException('Participant ID required');
    }

    // Verify this is a hunter
    const role = await this.gamesService.getParticipantRole(gameId, participantId);
    if (role !== Role.HUNTER) {
      throw new ForbiddenException('Only hunters can access this endpoint');
    }

    // Parse filters
    const participantIdsFilter = playerIds ? playerIds.split(',').filter(id => id.trim()) : undefined;
    const sinceDate = since ? new Date(since) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 200;

    const pings = await this.trackingService.getPlayerPingsFiltered(gameId, {
      participantIds: participantIdsFilter,
      since: sinceDate,
      limit: limitNum,
    });

    // Filter to only SPEEDHUNT and SILENTHUNT pings (hunter-triggered)
    const hunterRelevantPings = pings.filter(ping => 
      ping.source === 'SPEEDHUNT' || ping.source === 'SILENTHUNT'
    );

    // Transform to match frontend expectations
    return hunterRelevantPings.map((ping) => ({
      id: ping.id,
      gameId: ping.gameId,
      participantId: ping.participantId,
      playerName: ping.participant?.displayName || 'Unknown',
      role: ping.participant?.role,
      displayLocation: ping.revealedLocation,
      createdAt: ping.timestamp.toISOString(),
    }));
  }

  @Get('games/:gameId/hunter-app/players')
  @Public()
  @ApiOperation({ summary: 'Get list of players for hunter app filters' })
  @ApiResponse({ status: 200, description: 'Players retrieved' })
  @ApiResponse({ status: 403, description: 'Not a hunter' })
  async getPlayersForHunterApp(
    @Param('gameId') gameId: string,
    @Query('participantId') participantId: string,
  ) {
    if (!participantId) {
      throw new ForbiddenException('Participant ID required');
    }

    // Verify this is a hunter
    const role = await this.gamesService.getParticipantRole(gameId, participantId);
    if (role !== Role.HUNTER) {
      throw new ForbiddenException('Only hunters can access this endpoint');
    }

    // Get all players in the game
    const participants = await this.gamesService.getGameParticipants(gameId);
    const players = participants.filter(p => p.role?.toUpperCase() === 'PLAYER');
    
    return players.map(p => ({
      id: p.id,
      displayName: p.displayName,
      status: p.status,
    }));
  }

  // ============================================
  // SPEEDHUNT ENDPOINTS (Hunter Dashboard)
  // ============================================

  @Post('hunter/:gameId/:token/speedhunt/start')
  @Public()
  @ApiOperation({ summary: 'Start a speedhunt on a player' })
  @ApiResponse({ status: 201, description: 'Speedhunt started' })
  @ApiResponse({ status: 403, description: 'Daily limit reached or target has regeneration' })
  async startSpeedhunt(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
    @Body() body: { targetParticipantId: string; hunterParticipantId?: string },
  ) {
    const isValid = await this.gamesService.validateHunterToken(gameId, token);
    if (!isValid.valid) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }

    // Get speedhunt rule config
    const rule = await this.rulesService.findByGameAndType(gameId, RuleType.SPEEDHUNT);
    if (!rule || !rule.isEnabled) {
      throw new ForbiddenException('Speedhunt rule is not enabled for this game');
    }

    const pingsPerSpeedhunt = rule.config?.pingsPerSpeedhunt || 4; // Rulebook: 4 pings
    const speedhuntsPerDay = rule.config?.speedhuntsPerDay || 5;
    const preventConsecutiveTarget = rule.config?.preventConsecutiveTarget !== false; // Default true (Rulebook)

    // For hunter dashboard, we use a virtual hunter ID based on the token
    const hunterParticipantId = body.hunterParticipantId || `hunter-dashboard-${token.substring(0, 8)}`;

    const session = await this.rulesService.startSpeedhunt(
      gameId,
      hunterParticipantId,
      body.targetParticipantId,
      pingsPerSpeedhunt,
      speedhuntsPerDay,
      preventConsecutiveTarget,
    );

    return {
      success: true,
      speedhuntId: session.id,
      targetParticipantId: session.targetParticipantId,
      totalPings: session.totalPings,
      remainingPings: session.totalPings - session.usedPings,
    };
  }

  @Post('hunter/:gameId/:token/speedhunt/:speedhuntId/ping')
  @Public()
  @ApiOperation({ summary: 'Request next ping in active speedhunt' })
  @ApiResponse({ status: 201, description: 'Ping generated' })
  @ApiResponse({ status: 403, description: 'No pings remaining' })
  async speedhuntPing(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
    @Param('speedhuntId') speedhuntId: string,
  ) {
    const isValid = await this.gamesService.validateHunterToken(gameId, token);
    if (!isValid.valid) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }

    // Get speedhunt rule config for reveal delay
    const rule = await this.rulesService.findByGameAndType(gameId, RuleType.SPEEDHUNT);
    const revealDelaySeconds = rule?.config?.revealDelaySeconds || 60; // Rulebook: time-delayed, default 60s

    // Use the ping and get updated session
    const session = await this.rulesService.useSpeedhuntPing(speedhuntId);

    // Generate actual ping for the target with reveal delay
    const ping = await this.trackingService.generatePing(
      gameId,
      session.targetParticipantId,
      100, // radius
      revealDelaySeconds,
      PingSource.SPEEDHUNT,
    );

    return {
      success: true,
      ping: {
        id: ping.id,
        participantId: ping.participantId,
        displayLocation: ping.revealedLocation,
        createdAt: ping.timestamp.toISOString(),
        revealedAt: ping.revealedAt.toISOString(), // Frontend can use this to show countdown
      },
      remainingPings: session.totalPings - session.usedPings,
      completed: session.status === 'COMPLETED',
      revealDelaySeconds,
    };
  }

  @Get('hunter/:gameId/:token/speedhunt/active')
  @Public()
  @ApiOperation({ summary: 'Get active speedhunt if any' })
  @ApiResponse({ status: 200, description: 'Active speedhunt or null' })
  async getActiveSpeedhunt(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
  ) {
    try {
      const isValid = await this.gamesService.validateHunterToken(gameId, token);
      if (!isValid.valid) {
        throw new UnauthorizedException('Invalid or expired hunter token');
      }

      const hunterParticipantId = `hunter-dashboard-${token.substring(0, 8)}`;
      const session = await this.rulesService.getActiveSpeedhunt(hunterParticipantId);

      if (!session) {
        return { active: false };
      }

      return {
        active: true,
        speedhuntId: session.id,
        targetParticipantId: session.targetParticipantId,
        targetName: session.target?.displayName,
        totalPings: session.totalPings,
        usedPings: session.usedPings,
        remainingPings: session.totalPings - session.usedPings,
        startedAt: session.startedAt,
      };
    } catch (error) {
      console.error('[getActiveSpeedhunt] Error:', error);
      throw error;
    }
  }

  @Get('hunter/:gameId/:token/speedhunt/targets')
  @Public()
  @ApiOperation({ summary: 'Get available speedhunt targets (players without active protection)' })
  @ApiResponse({ status: 200, description: 'List of valid targets' })
  async getSpeedhuntTargets(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
  ) {
    const isValid = await this.gamesService.validateHunterToken(gameId, token);
    if (!isValid.valid) {
      throw new UnauthorizedException('Invalid or expired hunter token');
    }

    // For hunter dashboard, we use a virtual hunter ID based on the token
    const hunterParticipantId = `hunter-dashboard-${token.substring(0, 8)}`;

    // Get last speedhunt target for consecutive protection check
    const lastTargetId = await this.rulesService.getLastSpeedhuntTargetId(hunterParticipantId);

    // Get speedhunt rule config for consecutive target setting
    const rule = await this.rulesService.findByGameAndType(gameId, RuleType.SPEEDHUNT);
    const preventConsecutiveTarget = rule?.config?.preventConsecutiveTarget !== false;

    // Get all players in the game
    const participants = await this.gamesService.getGameParticipants(gameId);
    const players = participants.filter(p => p.role?.toUpperCase() === 'PLAYER');

    // Check protection status for each player
    const targets = await Promise.all(
      players.map(async (player) => {
        const hasRegeneration = await this.rulesService.hasActiveRegeneration(player.id);
        const hasHotelBonus = await this.rulesService.hasActiveHotelBonus(player.id);
        const hasCatchFree = await this.rulesService.hasActiveCatchFree(player.id);
        const isLastTarget = preventConsecutiveTarget && lastTargetId === player.id;

        let protectionType = null;
        if (hasRegeneration) protectionType = 'REGENERATION';
        else if (hasHotelBonus) protectionType = 'HOTEL_BONUS';
        else if (hasCatchFree) protectionType = 'CATCH_FREE';
        else if (isLastTarget) protectionType = 'CONSECUTIVE_TARGET';

        return {
          id: player.id,
          displayName: player.displayName,
          participantNumber: player.participantNumber,
          isProtected: hasRegeneration || hasHotelBonus || hasCatchFree || isLastTarget,
          protectionType,
        };
      })
    );

    return {
      targets,
      availableTargets: targets.filter(t => !t.isProtected),
    };
  }

  @Get('hunter/:gameId/:token/speedhunt/usage')
  @Public()
  @ApiOperation({ summary: 'Get daily speedhunt usage' })
  @ApiResponse({ status: 200, description: 'Usage statistics' })
  async getSpeedhuntUsage(
    @Param('gameId') gameId: string,
    @Param('token') token: string,
  ) {
    try {
      const isValid = await this.gamesService.validateHunterToken(gameId, token);
      if (!isValid.valid) {
        throw new UnauthorizedException('Invalid or expired hunter token');
      }

      const rule = await this.rulesService.findByGameAndType(gameId, RuleType.SPEEDHUNT);
      const maxPerDay = rule?.config?.speedhuntsPerDay || 5;

      const hunterParticipantId = `hunter-dashboard-${token.substring(0, 8)}`;
      const usedToday = await this.rulesService.getHunterSpeedhuntUsageToday(hunterParticipantId);

      return {
        usedToday,
        maxPerDay,
        remaining: Math.max(0, maxPerDay - usedToday),
      };
    } catch (error) {
      console.error('[getSpeedhuntUsage] Error:', error);
      throw error;
    }
  }

  // ============================================
  // GLOBAL SPEEDHUNT STATUS (for all players)
  // ============================================

  @Get('games/:gameId/speedhunt/global-status')
  @ApiOperation({ summary: 'Get global speedhunt status (visible to all players)' })
  @ApiResponse({ status: 200, description: 'Global speedhunt status without revealing target' })
  async getGlobalSpeedhuntStatus(
    @Param('gameId') gameId: string,
  ) {
    const activeSessions = await this.rulesService.getActiveSpeedhuntsForGame(gameId);
    
    if (activeSessions.length === 0) {
      return {
        active: false,
        sessions: [],
      };
    }

    // Return sessions WITHOUT revealing the target
    return {
      active: true,
      sessions: activeSessions.map(session => ({
        id: session.id,
        currentPing: session.usedPings + 1,
        totalPings: session.totalPings,
        remainingPings: session.totalPings - session.usedPings,
        startedAt: session.startedAt,
      })),
    };
  }

  // ============================================
  // FAKE PING JOKER (Rulebook: one-time false location)
  // ============================================

  @Post('games/:gameId/fake-ping')
  @ApiOperation({ summary: 'Use Fake-Ping joker to generate a ping at a false location' })
  @ApiResponse({ status: 201, description: 'Fake ping generated' })
  @ApiResponse({ status: 403, description: 'Fake-Ping not available or already used' })
  async useFakePing(
    @Param('gameId') gameId: string,
    @Body() body: { participantId: string; location: { lat: number; lng: number } },
    @CurrentUser() user: any,
  ) {
    // Validate the joker is available and mark it as used
    await this.rulesService.useFakePing(body.participantId, body.location.lat, body.location.lng);

    // Generate the fake ping at the specified location
    const ping = await this.trackingService.generateFakePing(
      gameId,
      body.participantId,
      body.location.lat,
      body.location.lng,
    );

    return {
      success: true,
      ping: {
        id: ping.id,
        gameId: ping.gameId,
        participantId: ping.participantId,
        playerName: ping.participant?.displayName || 'Unknown',
        displayLocation: ping.revealedLocation,
        createdAt: ping.timestamp.toISOString(),
        isFake: true,
      },
    };
  }
}
