import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PAYROLL_PAYMENT_RESULT_STATUSES = [
  'PAID',
  'FAILED',
  'RETURNED',
] as const;

export type PayrollPaymentResultStatus =
  (typeof PAYROLL_PAYMENT_RESULT_STATUSES)[number];

export class PayrollPaymentResultDto {
  @IsString()
  paymentItemId!: string;

  @IsIn(PAYROLL_PAYMENT_RESULT_STATUSES)
  status!: PayrollPaymentResultStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RecordPayrollPaymentResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PayrollPaymentResultDto)
  results!: PayrollPaymentResultDto[];
}
