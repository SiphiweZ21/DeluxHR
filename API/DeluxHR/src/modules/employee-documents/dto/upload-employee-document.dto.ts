import { EmployeeDocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class UploadEmployeeDocumentDto {
  @IsEnum(EmployeeDocumentType)
  documentType: EmployeeDocumentType;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
