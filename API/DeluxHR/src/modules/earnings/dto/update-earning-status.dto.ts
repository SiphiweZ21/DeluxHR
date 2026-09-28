import { IsEnum } from 'class-validator';

export enum PayrollItemStatusDto {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PROCESSED = 'PROCESSED',
  CANCELLED = 'CANCELLED',
}

export class UpdateEarningStatusDto {
  @IsEnum(PayrollItemStatusDto)
  status: PayrollItemStatusDto;
}