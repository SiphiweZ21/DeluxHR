import {
  AttendanceEventType,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OfflineAttendanceItemDto {
  @IsString()
  @MaxLength(100)
  offlineEventId!: string;

  @IsDateString()
  capturedAt!: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;

  @IsString()
  @MaxLength(20)
  identityMethod!: 'QR' | 'PIN';

  // For QR capture this is the employee QR token.
  // For PIN capture the kiosk stores employeeNumber after successful local identity verification.
  @IsString()
  @MaxLength(200)
  identityReference!: string;
}

export class SyncOfflineAttendanceDto {
  @IsString()
  @MaxLength(80)
  deviceCode!: string;

  @IsString()
  @MaxLength(200)
  deviceSecret!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OfflineAttendanceItemDto)
  events!: OfflineAttendanceItemDto[];
}
