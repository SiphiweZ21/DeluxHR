import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class PeriodDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
}
export class BucketDto extends PeriodDto {
  @IsString() @MinLength(1) @MaxLength(120) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) creditorName!: string;
}
export class AdjustmentDto extends BucketDto {
  @IsInt() @Min(-1000000000) @Max(1000000000) amountCents!: number;
  @IsString() @MinLength(8) @MaxLength(500) reason!: string;
}
export class PaymentDto extends BucketDto {
  @IsInt() @Min(1) @Max(1000000000) amountCents!: number;
  @IsString() @MinLength(3) @MaxLength(100) reference!: string;
  @IsDateString() paidAt!: string;
}
export class PaymentDecisionDto {
  @IsIn(['CONFIRMED', 'VOIDED']) status!: string;
  @IsString() @MinLength(8) @MaxLength(500) reason!: string;
}
