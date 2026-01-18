import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RulesService, CreateRuleDto, UpdateRuleDto } from './rules.service';
import { GameRule, RuleType } from './entities/game-rule.entity';
import { ParticipantRuleState } from './entities/participant-rule-state.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { TrackingService } from '../tracking/tracking.service';

@Controller('games/:gameId/rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly trackingService: TrackingService,
  ) {}

  @Post()
  async createRule(
    @Param('gameId') gameId: string,
    @Body() dto: CreateRuleDto,
  ): Promise<GameRule> {
    return this.rulesService.createRule(gameId, dto);
  }

  @Get()
  @Public()
  async getRules(@Param('gameId') gameId: string): Promise<GameRule[]> {
    return this.rulesService.getRules(gameId);
  }

  @Patch(':id')
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ): Promise<GameRule> {
    return this.rulesService.updateRule(id, dto);
  }

  @Delete(':id')
  async deleteRule(@Param('id') id: string): Promise<void> {
    return this.rulesService.deleteRule(id);
  }

  // ============================================
  // PARTICIPANT RULE ASSIGNMENT ENDPOINTS
  // ============================================

  @Post('participants/:participantId/assign')
  async assignRuleToParticipant(
    @Param('participantId') participantId: string,
    @Body() body: { ruleType: RuleType },
  ): Promise<ParticipantRuleState> {
    return this.rulesService.assignRuleToParticipant(participantId, body.ruleType);
  }

  @Delete('participants/:participantId/unassign')
  async unassignRuleFromParticipant(
    @Param('participantId') participantId: string,
    @Body() body: { ruleType: RuleType },
  ): Promise<void> {
    return this.rulesService.unassignRuleFromParticipant(participantId, body.ruleType);
  }

  @Get('participants/:participantId/states')
  async getParticipantRuleStates(
    @Param('participantId') participantId: string,
  ): Promise<ParticipantRuleState[]> {
    return this.rulesService.getParticipantRuleStates(participantId);
  }

  @Get('assigned/:ruleType')
  async getParticipantsWithRule(
    @Param('ruleType') ruleType: RuleType,
  ): Promise<ParticipantRuleState[]> {
    return this.rulesService.getParticipantsWithRule(ruleType);
  }

  // ============================================
  // JOKER ACTIVATION ENDPOINTS (Rulebook)
  // ============================================

  /**
   * Activate Catch-Free joker (Rulebook: 3h capture immunity)
   * POST /games/:gameId/rules/jokers/catch-free/activate
   */
  @Post('jokers/catch-free/activate')
  async activateCatchFree(
    @Param('gameId') gameId: string,
    @Body() body: { participantId: string },
  ): Promise<{ success: boolean; expiresAt: Date }> {
    const result = await this.rulesService.activateCatchFree(body.participantId);
    return { success: true, expiresAt: result.metadata.expiresAt };
  }

  /**
   * Get Catch-Free status for a participant
   * GET /games/:gameId/rules/jokers/catch-free/:participantId
   */
  @Get('jokers/catch-free/:participantId')
  async getCatchFreeStatus(
    @Param('participantId') participantId: string,
  ): Promise<{ 
    assigned: boolean;
    active: boolean;
    used: boolean;
    expiresAt?: Date;
    remainingMinutes?: number;
  }> {
    return this.rulesService.getCatchFreeStatus(participantId);
  }

  /**
   * Activate Hotel-Bonus joker (Rulebook: 6h ping protection)
   * POST /games/:gameId/rules/jokers/hotel-bonus/activate
   */
  @Post('jokers/hotel-bonus/activate')
  async activateHotelBonus(
    @Param('gameId') gameId: string,
    @Body() body: { participantId: string },
  ): Promise<{ success: boolean; expiresAt: Date }> {
    const result = await this.rulesService.activateHotelBonus(body.participantId);
    return { success: true, expiresAt: result.metadata.expiresAt };
  }

  /**
   * Get Hotel-Bonus status for a participant
   * GET /games/:gameId/rules/jokers/hotel-bonus/:participantId
   */
  @Get('jokers/hotel-bonus/:participantId')
  async getHotelBonusStatus(
    @Param('participantId') participantId: string,
  ): Promise<{ assigned: boolean; active: boolean; used: boolean; expiresAt?: Date }> {
    const isActive = await this.rulesService.hasActiveHotelBonus(participantId);
    // Get the state to find expiry
    const states = await this.rulesService.getParticipantRuleStates(participantId);
    const hotelBonusState = states.find(s => s.ruleType === RuleType.HOTEL_BONUS);
    return {
      assigned: hotelBonusState?.isAssigned ?? false,
      active: isActive,
      used: (hotelBonusState?.usageCount ?? 0) > 0 && !isActive,
      expiresAt: hotelBonusState?.expiresAt,
    };
  }

  /**
   * Use Fake-Ping joker (Rulebook: one-time false location ping)
   * POST /games/:gameId/rules/jokers/fake-ping/use
   */
  @Post('jokers/fake-ping/use')
  @Public()
  async useFakePing(
    @Param('gameId') gameId: string,
    @Body() body: { participantId: string; fakeLocation?: { lat: number; lng: number }; lat?: number; lng?: number },
  ): Promise<{ success: boolean; message: string }> {
    // Support both fakeLocation object and flat lat/lng
    const lat = body.fakeLocation?.lat ?? body.lat;
    const lng = body.fakeLocation?.lng ?? body.lng;
    if (!lat || !lng) {
      return { success: false, message: 'Missing coordinates' };
    }
    
    // Update the participant's rule state
    await this.rulesService.useFakePing(
      body.participantId,
      lat,
      lng,
    );
    
    // Generate the actual fake ping in the pings table
    await this.trackingService.generateFakePing(
      gameId,
      body.participantId,
      lat,
      lng,
    );
    
    return { success: true, message: 'Fake ping generated at specified location' };
  }

  /**
   * Check if Fake-Ping joker is available for a participant
   * GET /games/:gameId/rules/jokers/fake-ping/:participantId
   */
  @Get('jokers/fake-ping/:participantId')
  @Public()
  async getFakePingStatus(
    @Param('participantId') participantId: string,
  ): Promise<{ assigned: boolean; active: boolean; used: boolean; canUse: boolean }> {
    const canUse = await this.rulesService.canUseFakePing(participantId);
    const states = await this.rulesService.getParticipantRuleStates(participantId);
    const fakePingState = states.find(s => s.ruleType === RuleType.FAKE_PING);
    const alreadyUsed = fakePingState?.metadata?.used === true || (fakePingState?.usageCount ?? 0) > 0;
    return {
      assigned: fakePingState?.isAssigned ?? false,
      active: false, // Fake-Ping doesn't have active state
      used: alreadyUsed,
      canUse,
    };
  }
}
