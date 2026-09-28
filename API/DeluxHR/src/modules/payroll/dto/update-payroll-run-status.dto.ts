import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum PayrollRunStatusDto {
  DRAFT = 'DRAFT',
  CALCULATED = 'CALCULATED',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
  LOCKED = 'LOCKED',
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export class UpdatePayrollRunStatusDto {
  @IsEnum(PayrollRunStatusDto)
  status!: PayrollRunStatusDto;

  @IsOptional()
  @IsString()
  note?: string;
}
