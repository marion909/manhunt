import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ParticipantLoginDto {
  @ApiProperty({ description: 'Game ID' })
  @IsNotEmpty()
  @IsUUID()
  gameId: string;

  @ApiProperty({ description: 'Participant ID from QR code' })
  @IsNotEmpty()
  @IsUUID()
  participantId: string;
}
