import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { PositionUpdateDto } from './dto/position-update.dto';
import { PanicRequestDto } from './dto/panic-request.dto';
import { OverridePositionDto } from './dto/override-position.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Point } from 'geojson';

@ApiTags('tracking')
@Controller('tracking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

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

  @Get('games/:gameId/hunters')
  @ApiOperation({ summary: 'Get current hunter positions' })
  @ApiResponse({ status: 200, description: 'Hunter positions retrieved' })
  async getHunterPositions(@Param('gameId') gameId: string) {
    return this.trackingService.getHunterPositions(gameId);
  }

  @Get('games/:gameId/pings')
  @ApiOperation({ summary: 'Get recent player pings' })
  @ApiResponse({ status: 200, description: 'Pings retrieved' })
  async getPings(@Param('gameId') gameId: string) {
    const pings = await this.trackingService.getPlayerPings(gameId);
    // Transform to match frontend expectations
    return pings.map((ping) => ({
      id: ping.id,
      gameId: ping.gameId,
      participantId: ping.participantId,
      playerName: ping.participant?.displayName || 'Unknown',
      actualLocation: ping.actualLocation,
      displayLocation: ping.revealedLocation,
      offsetDistance: ping.radiusMeters,
      createdAt: ping.timestamp.toISOString(),
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
}
