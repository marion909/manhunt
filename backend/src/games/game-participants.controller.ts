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
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GameParticipantsService } from './game-participants.service';
import { CaptureCodeService } from '../captures/capture-code.service';
import { CreateManualParticipantDto } from './dto/create-manual-participant.dto';
import { Role, ParticipantStatus } from '../common/enums';

@Controller('games/:gameId/participants')
@UseGuards(JwtAuthGuard)
export class GameParticipantsController {
  constructor(
    private readonly participantsService: GameParticipantsService,
    private readonly captureCodeService: CaptureCodeService,
  ) {}

  /**
   * Get own capture code (PLAYER only)
   */
  @Get('me/capture-code')
  async getMyCaptureCode(
    @Param('gameId') gameId: string,
    @Request() req,
  ) {
    const participant = await this.participantsService.findParticipant(
      gameId,
      req.user.id,
    );

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.role !== Role.PLAYER) {
      throw new ForbiddenException('Only players have capture codes');
    }

    if (!participant.captureSecret) {
      throw new NotFoundException('Capture code not generated yet');
    }

    // Generate current TOTP code
    const code = this.captureCodeService.generateCode(participant.captureSecret);
    
    // Generate QR code data URL
    const qrCode = await this.captureCodeService.generateQRCode(
      gameId,
      participant.id,
      code,
    );

    // Get time remaining until next code
    const timeRemaining = this.captureCodeService.getTimeRemaining();

    return {
      code,
      qrCode,
      timeRemaining,
      participantId: participant.id,
    };
  }

  /**
   * Get capture code for any participant (ORGA/OPERATOR only)
   */
  @Get(':participantId/capture-code')
  async getParticipantCaptureCode(
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Request() req,
  ): Promise<{
    code: string;
    qrCode: string;
    timeRemaining: number;
    participantId: string;
  }> {
    // Check if requester is ORGA or OPERATOR
    const requester = await this.participantsService.findParticipant(
      gameId,
      req.user.id,
    );

    if (
      !requester ||
      (requester.role !== Role.ORGA && requester.role !== Role.OPERATOR)
    ) {
      throw new ForbiddenException(
        'Only ORGA and OPERATOR can view other participants capture codes',
      );
    }

    // Get target participant
    const participant = await this.participantsService.findParticipantById(
      participantId,
    );

    if (!participant || participant.gameId !== gameId) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.role !== Role.PLAYER) {
      throw new ForbiddenException('Only players have capture codes');
    }

    if (!participant.captureSecret) {
      throw new NotFoundException('Capture code not generated yet');
    }

    // Generate current TOTP code
    const code = this.captureCodeService.generateCode(participant.captureSecret);
    
    // Generate QR code data URL
    const qrCode = await this.captureCodeService.generateQRCode(
      gameId,
      participant.id,
      code,
    );

    // Get time remaining until next code
    const timeRemaining = this.captureCodeService.getTimeRemaining();

    return {
      code,
      qrCode,
      timeRemaining,
      participantId: participant.id,
    };
  }

  /**
   * Override participant status (ORGA/OPERATOR only)
   */
  @Patch(':userId/status')
  async overrideStatus(
    @Param('gameId') gameId: string,
    @Param('userId') userId: string,
    @Body() body: { status: ParticipantStatus },
    @Request() req,
  ) {
    return this.participantsService.overrideStatus(
      userId,
      gameId,
      body.status,
      req.user.id,
    );
  }

  /**
   * Add manual participant (ORGA/OPERATOR only)
   */
  @Post('manual')
  async addManualParticipant(
    @Param('gameId') gameId: string,
    @Body() createManualParticipantDto: CreateManualParticipantDto,
    @Request() req,
  ) {
    return this.participantsService.addManualParticipant(
      gameId,
      createManualParticipantDto.displayName,
      createManualParticipantDto.role,
      req.user.id,
    );
  }

  /**
   * Remove participant from game (ORGA only)
   */
  @Delete(':userId')
  async removeParticipant(
    @Param('gameId') gameId: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    await this.participantsService.removeParticipant(
      userId,
      gameId,
      req.user.id,
    );
    return { message: 'Participant removed successfully' };
  }
}
