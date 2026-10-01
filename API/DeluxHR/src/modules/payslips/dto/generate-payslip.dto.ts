import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GeneratePayslipDto {
  @IsUUID()
  payrollRunId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
