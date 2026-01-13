import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { PositionUpdateDto } from './dto/position-update.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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
    return this.trackingService.getPlayerPings(gameId);
  }

  @Get('games/:gameId/history/:userId')
  @ApiOperation({ summary: 'Get position history for user' })
  @ApiResponse({ status: 200, description: 'Position history retrieved' })
  async getHistory(@Param('gameId') gameId: string, @Param('userId') userId: string) {
    return this.trackingService.getPositionHistory(gameId, userId, 100);
  }
}
