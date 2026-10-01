import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class DetectMissingCheckoutDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  // Until shifts/schedules exist in 6B, this is a conservative operational
  // threshold: an open check-in older than this many hours can be surfaced
  // for review. It is not an absence/payroll rule.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  olderThanHours: number = 18;
}
