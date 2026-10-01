import {
  AttendanceChannel,
  AttendanceEventType,
  AttendanceLocationVerificationStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AttendanceHistoryQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @IsOptional()
  @IsEnum(AttendanceChannel)
  channel?: AttendanceChannel;

  @IsOptional()
  @IsEnum(AttendanceEventType)
  eventType?: AttendanceEventType;

  @IsOptional()
  @IsEnum(AttendanceLocationVerificationStatus)
  locationVerificationStatus?: AttendanceLocationVerificationStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 50;
}
