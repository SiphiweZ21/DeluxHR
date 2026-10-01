import { IsEnum } from 'class-validator';

export enum PayslipStatusDto {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

export class UpdatePayslipStatusDto {
  @IsEnum(PayslipStatusDto)
  status!: PayslipStatusDto;
}
