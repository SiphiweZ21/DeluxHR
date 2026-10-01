import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreatePayrollBatchDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsDateString()
  payPeriodStart!: string;

  @IsDateString()
  payPeriodEnd!: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}
