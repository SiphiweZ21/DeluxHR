import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { OvertimeApprovalStatus, TimesheetStatus } from '@prisma/client';
export class GenerateTimesheetDto { @IsUUID() employeeId!: string; @IsDateString() periodStart!: string; @IsDateString() periodEnd!: string; }
export class PeriodDto { @IsDateString() periodStart!: string; @IsDateString() periodEnd!: string; }
export class OvertimePolicyDto {
 @IsInt() @Min(1) @Max(1440) dailyThresholdMinutes!: number;
 @IsInt() @Min(0) @Max(1440) maxDailyOvertimeMinutes!: number;
 @IsBoolean() requireApproval!: boolean;
}
export class ReviewOvertimeDto {
 @IsEnum(OvertimeApprovalStatus) status!: OvertimeApprovalStatus;
 @IsOptional() @IsInt() @Min(0) approvedMinutes?: number;
 @IsString() @MaxLength(500) reason!: string;
}
export class ManualEntryDto { @IsString() @MaxLength(500) reason!: string; }
export class StatusDto { @IsEnum(TimesheetStatus) status!: TimesheetStatus; }
