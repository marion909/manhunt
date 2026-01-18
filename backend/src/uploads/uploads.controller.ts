import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService, UploadType, UploadedFile as UploadResult } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { memoryStorage } from 'multer';

/**
 * Controller for handling file uploads
 * Provides endpoints for capture photos, handcuff photos, etc.
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Upload a capture photo
   * POST /uploads/capture-photo
   */
  @Post('capture-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async uploadCapturePhoto(
    @UploadedFile() file: any,
    @Body('gameId') gameId?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadsService.saveFile(file, UploadType.CAPTURE, gameId);
  }

  /**
   * Upload a handcuff photo (Rulebook: required for capture confirmation)
   * POST /uploads/handcuff-photo
   */
  @Post('handcuff-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async uploadHandcuffPhoto(
    @UploadedFile() file: any,
    @Body('gameId') gameId?: string,
    @Body('captureId') captureId?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Include captureId in filename if provided for easier association
    const contextId = captureId || gameId;
    return this.uploadsService.saveFile(file, UploadType.HANDCUFF, contextId);
  }

  /**
   * Upload a profile photo
   * POST /uploads/profile-photo
   */
  @Post('profile-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB for profiles
      },
    }),
  )
  async uploadProfilePhoto(
    @UploadedFile() file: any,
    @Body('userId') userId?: string,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadsService.saveFile(file, UploadType.PROFILE, userId);
  }
}
