import {
  AttendanceEventType,
} from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SiteQrAttendanceDto {
  @IsString()
  @MaxLength(200)
  siteQrToken!: string;

  @IsEnum(AttendanceEventType)
  eventType!: AttendanceEventType;

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
}
