import { IsOptional, IsString } from 'class-validator';

export class SendPayslipWhatsAppDto {
  @IsOptional()
  @IsString()
  message?: string;
}