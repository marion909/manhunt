import { IsEnum, IsInt, IsDateString, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums';

export class CreateInvitationDto {
  @ApiProperty({ enum: Role, example: Role.HUNTER })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxUses?: number;

  @ApiProperty({ example: '2026-01-31T23:59:59Z', required: false })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
