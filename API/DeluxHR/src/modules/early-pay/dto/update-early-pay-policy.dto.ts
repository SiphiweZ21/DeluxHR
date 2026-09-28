import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateEarlyPayPolicyDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1) minimumQualifyingDays?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(100) accessibleNetPercentage?: number;
  @IsOptional() @IsNumber() @Min(0) minimumRequestAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maximumRequestAmount?: number;
  @IsOptional() @IsInt() @Min(1) maximumRequestsPerPeriod?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) paydayDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(14) paydayCutoffDays?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) estimatedPayeReserveRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) estimatedUifReserveRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) protectedDeductionRate?: number;
  @IsOptional() @IsNumber() @Min(0) serviceFee?: number;
  @IsOptional() @IsNumber() @Min(0) standardTransferFee?: number;
  @IsOptional() @IsNumber() @Min(0) instantTransferFee?: number;
}
