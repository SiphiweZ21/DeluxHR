import {
  AttendanceEventType,
} from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class FieldAttendanceDto {
  @IsUUID()
  workLocationId!: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  locationAccuracyM?: number;
}
