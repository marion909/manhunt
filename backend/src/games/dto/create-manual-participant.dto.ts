import { IsString, IsEnum, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { Role } from '../../common/enums';

export class CreateManualParticipantDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;

  @IsEnum(Role)
  role: Role;
}
