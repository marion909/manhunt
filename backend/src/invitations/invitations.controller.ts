import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('invitations')
@Controller('invitations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('games/:gameId')
  @ApiOperation({ summary: 'Create invitation token for game' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  @ApiResponse({ status: 403, description: 'Only ORGA can create invitations' })
  create(
    @Param('gameId') gameId: string,
    @Body() createInvitationDto: CreateInvitationDto,
    @CurrentUser() user: any,
  ) {
    return this.invitationsService.create(gameId, createInvitationDto, user.userId);
  }

  @Get('games/:gameId')
  @ApiOperation({ summary: 'Get all invitations for game' })
  @ApiResponse({ status: 200, description: 'Invitations retrieved' })
  findAll(@Param('gameId') gameId: string, @CurrentUser() user: any) {
    return this.invitationsService.findAllByGame(gameId, user.userId);
  }

  @Post('accept/:token')
  @ApiOperation({ summary: 'Accept invitation and join game' })
  @ApiResponse({ status: 200, description: 'Invitation accepted' })
  @ApiResponse({ status: 400, description: 'Invitation expired or invalid' })
  accept(@Param('token') token: string, @CurrentUser() user: any) {
    return this.invitationsService.accept(token, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  revoke(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitationsService.revoke(id, user.userId);
  }
}
