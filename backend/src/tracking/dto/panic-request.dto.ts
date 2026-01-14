import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PointDto {
  @ApiProperty({ example: 'Point' })
  type: string;

  @ApiProperty({ example: [13.405, 52.52], description: '[longitude, latitude]' })
  coordinates: [number, number];
}

export class PanicRequestDto {
  @ApiProperty({ description: 'Game ID' })
  @IsString()
  @IsNotEmpty()
  gameId: string;

  @ApiProperty({ description: 'Current location', type: PointDto })
  @ValidateNested()
  @Type(() => PointDto)
  location: PointDto;
}
