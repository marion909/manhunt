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
import { CapturesService, InitiateCaptureDto, ResolveCaptureDto, ScanCaptureDto } from './captures.service';
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

  @Post('scan')
  async scanCapture(
    @Param('gameId') gameId: string,
    @Request() req,
    @Body() dto: ScanCaptureDto,
  ): Promise<Capture> {
    return this.capturesService.captureByQRCode(gameId, req.user.id, dto);
  }
}
