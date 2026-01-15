import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { GameParticipantsService } from './game-participants.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('games')
@Controller('games')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly participantsService: GameParticipantsService,
  ) {}

  @Get('host-ip')
  @Public()
  @ApiOperation({ summary: 'Get server host IP' })
  @ApiResponse({ status: 200, description: 'Host IP retrieved' })
  getHostIp(@Req() request: Request) {
    const hostHeader = request.get('host');
    const forwarded = request.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : (request.ip || 'localhost');
    const hostname = hostHeader ? hostHeader.split(':')[0] : 'localhost';
    
    return {
      ip: ip === '::1' || ip === '127.0.0.1' ? 'localhost' : ip,
      hostname: hostname,
      combined: hostname,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create new game' })
  @ApiResponse({ status: 201, description: 'Game created' })
  create(@Body() createGameDto: CreateGameDto, @CurrentUser() user: any) {
    return this.gamesService.create(createGameDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all games for current user' })
  @ApiResponse({ status: 200, description: 'Games retrieved' })
  findAll(@CurrentUser() user: any) {
    return this.gamesService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get game by ID' })
  @ApiResponse({ status: 200, description: 'Game retrieved' })
  @ApiResponse({ status: 404, description: 'Game not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.findOne(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update game' })
  @ApiResponse({ status: 200, description: 'Game updated' })
  @ApiResponse({ status: 403, description: 'Only ORGA can update' })
  update(@Param('id') id: string, @Body() updateGameDto: UpdateGameDto, @CurrentUser() user: any) {
    return this.gamesService.update(id, updateGameDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete game' })
  @ApiResponse({ status: 200, description: 'Game deleted' })
  @ApiResponse({ status: 403, description: 'Only creator can delete' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.remove(id, user.userId);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start game (ORGA only)' })
  @ApiResponse({ status: 200, description: 'Game started' })
  @ApiResponse({ status: 403, description: 'Only ORGA can start' })
  startGame(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.startGame(id, user.userId);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause game (ORGA/OPERATOR)' })
  @ApiResponse({ status: 200, description: 'Game paused' })
  @ApiResponse({ status: 403, description: 'Only ORGA or OPERATOR can pause' })
  pauseGame(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.pauseGame(id, user.userId);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume game (ORGA/OPERATOR)' })
  @ApiResponse({ status: 200, description: 'Game resumed' })
  @ApiResponse({ status: 403, description: 'Only ORGA or OPERATOR can resume' })
  resumeGame(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.resumeGame(id, user.userId);
  }

  @Post(':id/finish')
  @ApiOperation({ summary: 'Finish game (ORGA only)' })
  @ApiResponse({ status: 200, description: 'Game finished' })
  @ApiResponse({ status: 403, description: 'Only ORGA can finish' })
  finishGame(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.finishGame(id, user.userId);
  }

  @Get(':id/participants')
  @Public()
  @ApiOperation({ summary: 'Get all participants for game' })
  @ApiResponse({ status: 200, description: 'Participants retrieved' })
  getParticipants(@Param('id') id: string) {
    return this.participantsService.getGameParticipants(id);
  }

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get game statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  getStatistics(@Param('id') id: string) {
    return this.participantsService.getGameStatistics(id);
  }

  @Get(':id/participants/me')
  @ApiOperation({ summary: 'Get current user role in game' })
  @ApiResponse({ status: 200, description: 'Role retrieved' })
  getMyRole(@Param('id') id: string, @CurrentUser() user: any) {
    return this.participantsService.getParticipantRole(user.userId, id);
  }

  @Post(':id/participants/:userId/disqualify')
  @ApiOperation({ summary: 'Disqualify participant (ORGA/OPERATOR)' })
  @ApiResponse({ status: 200, description: 'Participant disqualified' })
  @ApiResponse({ status: 403, description: 'Only ORGA or OPERATOR can disqualify' })
  disqualifyParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.participantsService.disqualifyParticipant(userId, id, user.userId);
  }

  // Hunter Access Endpoints

  @Get(':id/hunter-access')
  @ApiOperation({ summary: 'Get current hunter access token status' })
  @ApiResponse({ status: 200, description: 'Hunter access retrieved' })
  getHunterAccess(@Param('id') id: string) {
    return this.gamesService.getHunterAccess(id);
  }

  @Post(':id/hunter-access')
  @ApiOperation({ summary: 'Create or get hunter access token (ORGA only)' })
  @ApiResponse({ status: 201, description: 'Hunter access created' })
  @ApiResponse({ status: 403, description: 'Only ORGA can create' })
  createHunterAccess(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.createOrGetHunterAccess(id, user.userId);
  }

  @Post(':id/hunter-access/regenerate')
  @ApiOperation({ summary: 'Regenerate hunter access token (ORGA only)' })
  @ApiResponse({ status: 200, description: 'Hunter access regenerated' })
  @ApiResponse({ status: 403, description: 'Only ORGA can regenerate' })
  regenerateHunterAccess(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.regenerateHunterAccess(id, user.userId);
  }

  @Delete(':id/hunter-access')
  @ApiOperation({ summary: 'Deactivate hunter access token (ORGA only)' })
  @ApiResponse({ status: 200, description: 'Hunter access deactivated' })
  @ApiResponse({ status: 403, description: 'Only ORGA can deactivate' })
  deactivateHunterAccess(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.deactivateHunterAccess(id, user.userId);
  }

  @Get(':id/hunter-access/:token/validate')
  @Public()
  @ApiOperation({ summary: 'Validate hunter access token (public)' })
  @ApiResponse({ status: 200, description: 'Token validated' })
  validateHunterToken(@Param('id') id: string, @Param('token') token: string) {
    return this.gamesService.validateHunterToken(id, token);
  }
}
