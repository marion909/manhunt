import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

@Injectable()
export class CaptureCodeService {
  private readonly CODE_WINDOW = 1; // Allow 1 step tolerance (30s before/after)
  private readonly CODE_STEP = 30; // 30 seconds per code

  constructor() {
    // Configure TOTP settings
    authenticator.options = {
      step: this.CODE_STEP,
      window: this.CODE_WINDOW,
    };
  }

  /**
   * Generate a new TOTP secret for a player
   */
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Generate current TOTP code from secret
   */
  generateCode(secret: string): string {
    return authenticator.generate(secret);
  }

  /**
   * Verify if a TOTP code is valid for a given secret
   */
  verifyCode(code: string, secret: string): boolean {
    try {
      return authenticator.verify({ token: code, secret });
    } catch (error) {
      return false;
    }
  }

  /**
   * Get time until next code change (in seconds)
   */
  getTimeRemaining(): number {
    const now = Math.floor(Date.now() / 1000);
    return this.CODE_STEP - (now % this.CODE_STEP);
  }

  /**
   * Generate QR code data URL for displaying to player
   */
  async generateQRCode(gameId: string, participantId: string, code: string): Promise<string> {
    // Format: manhunt://capture/{gameId}/{participantId}/{code}
    const captureUrl = `manhunt://capture/${gameId}/${participantId}/${code}`;
    
    try {
      return await QRCode.toDataURL(captureUrl, {
        errorCorrectionLevel: 'H',
        width: 300,
        margin: 2,
      });
    } catch (error) {
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Parse QR code payload
   */
  parseQRPayload(payload: string): { gameId: string; participantId: string; code: string } | null {
    const match = payload.match(/^manhunt:\/\/capture\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!match) {
      return null;
    }

    return {
      gameId: match[1],
      participantId: match[2],
      code: match[3],
    };
  }
}
