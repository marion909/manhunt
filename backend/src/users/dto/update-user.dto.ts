import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'John Doe', required: false })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty({ example: '+49 123 456789', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'newemail@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;
}
