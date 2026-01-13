import { IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PositionUpdateDto {
  @ApiProperty({ example: 52.520008 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 13.404954 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 10.5, required: false })
  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  altitude?: number;

  @ApiProperty({ example: 5.2, required: false })
  @IsNumber()
  @IsOptional()
  speed?: number;

  @ApiProperty({ example: 90, required: false })
  @IsNumber()
  @IsOptional()
  heading?: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsOptional()
  isEmergency?: boolean;
}
