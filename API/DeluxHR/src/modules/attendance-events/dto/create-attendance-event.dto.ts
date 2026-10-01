import {
  AttendanceChannel,
  AttendanceEventType,
} from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAttendanceEventDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;

  @IsEnum(AttendanceChannel)
  channel!: AttendanceChannel;

  @IsISO8601()
  capturedAt!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  locationAccuracyM?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  deviceReference?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
