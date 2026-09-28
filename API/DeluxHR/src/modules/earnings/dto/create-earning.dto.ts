import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum EarningTypeDto {
  SALARY = 'SALARY',
  OVERTIME = 'OVERTIME',
  BONUS = 'BONUS',
  COMMISSION = 'COMMISSION',
  ALLOWANCE = 'ALLOWANCE',
  REIMBURSEMENT = 'REIMBURSEMENT',
  OTHER = 'OTHER',
}

export class CreateEarningDto {
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsUUID()
  payrollRunId?: string;

  @IsString()
  title: string;

  @IsEnum(EarningTypeDto)
  type: EarningTypeDto;

  @IsOptional()
  @IsString()
  source?: string;

  @IsDateString()
  payPeriodStart: string;

  @IsDateString()
  payPeriodEnd: string;

  @IsDateString()
  earnedDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  units?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;
}