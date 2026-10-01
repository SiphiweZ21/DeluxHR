import {
  AttendanceEventType,
} from '@prisma/client';
import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class KioskPinAttendanceDto {
  @IsString()
  @MaxLength(200)
  deviceCode!: string;

  @IsString()
  @MaxLength(200)
  deviceSecret!: string;

  @IsString()
  @MaxLength(80)
  employeeNumber!: string;

  @IsString()
  @Matches(/^\d{4,8}$/)
  pin!: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;
}
