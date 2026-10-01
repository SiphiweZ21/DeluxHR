import { AttendanceEventType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAttendanceCorrectionDto {
  @IsEnum(AttendanceEventType)
  correctedEventType!: AttendanceEventType;

  @IsDateString()
  correctedCapturedAt!: string;

  @IsOptional()
  @IsUUID()
  correctedWorkLocationId?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
