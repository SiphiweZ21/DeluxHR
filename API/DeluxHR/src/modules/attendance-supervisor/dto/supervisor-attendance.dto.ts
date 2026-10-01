import {
  AttendanceEventType,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SupervisorAttendanceDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  workLocationId!: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;

  // The time the supervisor says the attendance event actually occurred.
  // This is intentionally separate from the server receivedAt timestamp.
  @IsDateString()
  capturedAt!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
