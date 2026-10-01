import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { LeaveAccrualMode, LeaveBalanceAdjustmentType } from '@prisma/client';
export class CreateLeavePolicyDto {
 @IsUUID() leaveTypeId!: string;
 @IsString() @MaxLength(40) code!: string;
 @IsString() @MaxLength(120) name!: string;
 @IsBoolean() isDefault!: boolean;
 @IsNumber() @Min(0) @Max(365) annualEntitlementDays!: number;
 @IsEnum(LeaveAccrualMode) accrualMode!: LeaveAccrualMode;
 @IsNumber() @Min(0) @Max(365) carryOverMaxDays!: number;
 @IsInt() @Min(0) @Max(12) carryOverExpiryMonths!: number;
 @IsNumber() @Min(0) @Max(365) maxNegativeDays!: number;
 @IsInt() @Min(0) @Max(120) probationMonths!: number;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique() @IsInt({ each: true }) @Min(1,{ each: true }) @Max(7,{ each: true }) workingWeekdays!: number[];
 @IsBoolean() excludePublicHolidays!: boolean;
 @IsOptional() @IsBoolean() supportingDocumentRequired?: boolean;
 @IsOptional() @IsInt() @Min(1) @Max(366) medicalCertificateAfterDays?: number;
}
export class AssignLeavePolicyDto {
 @IsUUID() employeeId!: string;
 @IsUUID() policyId!: string;
 @IsDateString() effectiveFrom!: string;
 @IsOptional() @IsDateString() effectiveTo?: string;
}
export class AdjustLeaveBalanceDto {
 @IsUUID() employeeId!: string;
 @IsUUID() leaveTypeId!: string;
 @IsDateString() effectiveDate!: string;
 @IsEnum(LeaveBalanceAdjustmentType) type!: LeaveBalanceAdjustmentType;
 @IsNumber() @Min(0.01) @Max(365) days!: number;
 @IsString() @MaxLength(500) reason!: string;
}
export class CreatePublicHolidayDto { @IsDateString() date!: string; @IsString() @MaxLength(120) name!: string; }
export class LeaveDatesDto { @IsDateString() startDate!: string; @IsDateString() endDate!: string; @IsUUID() leaveTypeId!: string; @IsUUID() employeeId!: string; }
export class EndLeavePolicyAssignmentDto { @IsDateString() effectiveTo!: string; }
