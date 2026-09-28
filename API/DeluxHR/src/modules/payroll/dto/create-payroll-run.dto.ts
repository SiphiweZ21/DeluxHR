import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePayrollRunDto {
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsDateString()
  payPeriodStart: string;

  @IsDateString()
  payPeriodEnd: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}