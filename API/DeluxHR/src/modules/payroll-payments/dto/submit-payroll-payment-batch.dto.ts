import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitPayrollPaymentBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankSubmissionReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
