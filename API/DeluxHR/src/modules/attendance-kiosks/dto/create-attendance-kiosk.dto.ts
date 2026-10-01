import {
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAttendanceKioskDto {
  @IsUUID()
  workLocationId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;
}
