import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
  IsArray,
  ValidateNested,
  IsEnum,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BoundaryType } from '../../common/enums';

export class CreateBoundaryDto {
  @ApiProperty({ example: 'Main Game Area' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ enum: BoundaryType, example: BoundaryType.INNER_ZONE })
  @IsEnum(BoundaryType)
  type: BoundaryType;

  @ApiProperty({
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [13.404954, 52.520008],
          [13.404954, 52.530008],
          [13.424954, 52.530008],
          [13.424954, 52.520008],
          [13.404954, 52.520008],
        ],
      ],
    },
  })
  @IsObject()
  geometry: any;
}

export class CreateGameDto {
  @ApiProperty({ example: 'Berlin Manhunt 2026' })
  @IsString()
  name: string;

  @ApiProperty({ example: '72-hour city-wide chase game', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-01-20T10:00:00Z', required: false })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiProperty({ example: '2026-01-23T10:00:00Z', required: false })
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiProperty({ example: 120 })
  @IsInt()
  @Min(1)
  @IsOptional()
  pingIntervalMinutes?: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  captureRadiusMeters?: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  nightModeEnabled?: boolean;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  nightStartHour?: number;

  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(0)
  @IsOptional()
  nightEndHour?: number;

  @ApiProperty({ type: [CreateBoundaryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBoundaryDto)
  @IsOptional()
  boundaries?: CreateBoundaryDto[];

  @ApiProperty({
    example: {
      type: 'Point',
      coordinates: [13.404954, 52.520008],
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  centerPoint?: any;
}
