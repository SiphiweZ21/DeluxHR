import { AttendanceExceptionStatus } from '@prisma/client';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResolveAttendanceExceptionDto {
  @IsEnum(AttendanceExceptionStatus)
  status!: AttendanceExceptionStatus;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  resolutionNote!: string;
}
