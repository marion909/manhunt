import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class LocationDto {
  @ApiProperty({ example: 52.52 })
  latitude: number;

  @ApiProperty({ example: 13.405 })
  longitude: number;
}

export class OverridePositionDto {
  @ApiProperty({ description: 'User ID to override' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'New location', type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;
}
