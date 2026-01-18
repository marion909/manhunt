import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { 
  CapturesService, 
  InitiateCaptureDto, 
  ResolveCaptureDto, 
  ScanCaptureDto,
  UploadHandcuffDto,
} from './captures.service';
import { Capture } from './entities/capture.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('games/:gameId/captures')
@UseGuards(JwtAuthGuard)
export class CapturesController {
  constructor(private readonly capturesService: CapturesService) {}

  @Post()
  async initiateCapture(
    @Param('gameId') gameId: string,
    @Request() req,
    @Body() dto: InitiateCaptureDto,
  ): Promise<Capture> {
    return this.capturesService.initiateCapture(gameId, req.user.id, dto);
  }

  @Get()
  async getCaptures(@Param('gameId') gameId: string): Promise<Capture[]> {
    return this.capturesService.getCaptures(gameId);
  }

  @Get('pending')
  async getPendingCaptures(@Param('gameId') gameId: string): Promise<Capture[]> {
    return this.capturesService.getPendingCaptures(gameId);
  }

  @Get('pending-handcuff')
  async getPendingHandcuffCaptures(
    @Param('gameId') gameId: string,
    @Request() req,
  ): Promise<Capture[]> {
    return this.capturesService.getPendingHandcuffCaptures(gameId, req.user.id);
  }

  @Get(':id')
  async getCapture(@Param('id') id: string): Promise<Capture> {
    return this.capturesService.getCapture(id);
  }

  @Patch(':id')
  async resolveCapture(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: ResolveCaptureDto,
  ): Promise<Capture> {
    return this.capturesService.resolveCapture(id, req.user.id, dto);
  }

  /**
   * Confirm capture with handcuff photo (Rulebook: two-step capture flow)
   */
  @Patch(':id/handcuff')
  async confirmWithHandcuff(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UploadHandcuffDto,
  ): Promise<Capture> {
    return this.capturesService.confirmWithHandcuff(id, req.user.id, dto);
  }

  @Post('scan')
  async scanCapture(
    @Param('gameId') gameId: string,
    @Request() req,
    @Body() dto: ScanCaptureDto,
  ): Promise<Capture> {
    return this.capturesService.captureByQRCode(gameId, req.user.id, dto);
  }
}

/**
 * Standalone captures controller for routes not nested under gameId
 */
@Controller('captures')
@UseGuards(JwtAuthGuard)
export class CapturesStandaloneController {
  constructor(private readonly capturesService: CapturesService) {}

  /**
   * QR capture endpoint - used by mobile app
   */
  @Post('qr-capture')
  async qrCapture(
    @Body() body: { gameId: string; hunterId: string; playerId: string; captureSecret: string },
  ): Promise<Capture> {
    return this.capturesService.captureByQRCode(body.gameId, body.hunterId, {
      participantId: body.playerId,
      code: body.captureSecret,
    });
  }

  /**
   * Confirm capture with handcuff photo
   */
  @Post(':id/confirm-handcuff')
  async confirmHandcuff(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: { handcuffPhotoUrl: string },
  ): Promise<Capture> {
    return this.capturesService.confirmWithHandcuff(id, req.user.id, {
      handcuffPhotoUrl: dto.handcuffPhotoUrl,
    });
  }
}
