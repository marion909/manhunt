import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Event } from './entities/event.entity';
import { EventType } from '../common/enums/event-type.enum';
import { EventSeverity } from '../common/enums/event-severity.enum';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('games/:gameId')
  @ApiOperation({ summary: 'Get all events for a game' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getGameEvents(
    @Param('gameId') gameId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<{ events: Event[]; total: number }> {
    return this.eventsService.findByGame(gameId, limit, offset);
  }

  @Get('games/:gameId/users/:userId')
  @ApiOperation({ summary: 'Get events for a specific user in a game' })
  @ApiResponse({ status: 200, description: 'User events retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserEvents(
    @Param('gameId') gameId: string,
    @Param('userId') userId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<Event[]> {
    return this.eventsService.findByUserInGame(gameId, userId, limit);
  }

  @Get('games/:gameId/type/:type')
  @ApiOperation({ summary: 'Get events by type' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEventsByType(
    @Param('gameId') gameId: string,
    @Param('type') type: EventType,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<Event[]> {
    return this.eventsService.findByType(gameId, type, limit);
  }

  @Get('games/:gameId/severity/:severity')
  @ApiOperation({ summary: 'Get events by severity' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEventsBySeverity(
    @Param('gameId') gameId: string,
    @Param('severity') severity: EventSeverity,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<Event[]> {
    return this.eventsService.findBySeverity(gameId, severity, limit);
  }

  @Get('games/:gameId/critical')
  @ApiOperation({ summary: 'Get critical events (warnings, errors, critical)' })
  @ApiResponse({ status: 200, description: 'Critical events retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCriticalEvents(
    @Param('gameId') gameId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<Event[]> {
    return this.eventsService.findCriticalEvents(gameId, limit);
  }
}
