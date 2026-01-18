import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadedFile {
  filename: string;
  path: string;
  url: string;
  size: number;
  mimetype: string;
}

// Multer file interface
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer: Buffer;
}

export enum UploadType {
  CAPTURE = 'capture',
  HANDCUFF = 'handcuff',
  PROFILE = 'profile',
}

/**
 * Service for handling file uploads
 * Stores files locally in the uploads directory
 * In production, this could be swapped for S3, GCS, etc.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir: string;
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

  constructor() {
    // Use environment variable or default to 'uploads' directory
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    this.ensureUploadDirExists();
  }

  /**
   * Ensure upload directory exists
   */
  private ensureUploadDirExists(): void {
    const subdirs = [UploadType.CAPTURE, UploadType.HANDCUFF, UploadType.PROFILE];
    
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }

    for (const subdir of subdirs) {
      const subdirPath = path.join(this.uploadDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
      }
    }
  }

  /**
   * Save an uploaded file
   */
  async saveFile(
    file: MulterFile,
    type: UploadType,
    gameId?: string,
  ): Promise<UploadedFile> {
    // Validate file
    this.validateFile(file);

    // Generate unique filename
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${gameId ? gameId + '_' : ''}${uuidv4()}${ext}`;
    const subdirPath = path.join(this.uploadDir, type);
    const filePath = path.join(subdirPath, filename);

    // Write file to disk
    await fs.promises.writeFile(filePath, file.buffer);

    this.logger.log(`Saved ${type} file: ${filename} (${file.size} bytes)`);

    // Generate URL (relative path for serving via static files)
    const url = `/uploads/${type}/${filename}`;

    return {
      filename,
      path: filePath,
      url,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: MulterFile): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  /**
   * Delete a file by its URL
   */
  async deleteFile(url: string): Promise<boolean> {
    try {
      // Extract path from URL
      const relativePath = url.replace(/^\/uploads\//, '');
      const filePath = path.join(this.uploadDir, relativePath);

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        this.logger.log(`Deleted file: ${filePath}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the full path to the uploads directory
   */
  getUploadDir(): string {
    return this.uploadDir;
  }
}
