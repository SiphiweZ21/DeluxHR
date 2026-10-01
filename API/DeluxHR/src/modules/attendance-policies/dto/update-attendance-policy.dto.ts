import { AttendanceChannel } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateAttendancePolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @IsOptional()
  @IsBoolean()
  attendanceRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  checkInRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  checkOutRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AttendanceChannel, { each: true })
  allowedChannels?: AttendanceChannel[];

  @IsOptional()
  @IsBoolean()
  locationVerificationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  offlineKioskAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  supervisorFallbackAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
