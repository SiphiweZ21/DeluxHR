import {
  AttendanceEventType,
} from '@prisma/client';
import {
  IsEnum,
  IsString,
  MaxLength,
} from 'class-validator';

export class KioskQrAttendanceDto {
  @IsString()
  @MaxLength(200)
  deviceCode!: string;

  @IsString()
  @MaxLength(200)
  deviceSecret!: string;

  @IsString()
  @MaxLength(200)
  qrToken!: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;
}
