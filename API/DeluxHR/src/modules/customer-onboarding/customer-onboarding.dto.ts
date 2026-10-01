import {
  IsEmail,
  Matches,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';
export class CreateCustomerDto {
  @IsString() @MinLength(2) @MaxLength(200) organizationName!: string;
  @IsString() @MinLength(2) @MaxLength(120) administratorName!: string;
  @IsEmail() administratorEmail!: string;
  @IsString() @MinLength(12) @MaxLength(128) administratorPassword!: string;
}
export class OnboardingConfirmationDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreatePositionDto {
  @IsUUID() departmentId!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
}

export class CompanyDocumentDto {
  @IsIn([
    'REGISTRATION',
    'TAX_REGISTRATION',
    'ADDRESS_PROOF',
    'OTHER',
    'COIDA_REGISTRATION',
    'COIDA_GOOD_STANDING',
    'COIDA_ASSESSMENT',
    'PSIRA_BUSINESS_REGISTRATION',
    'PSIRA_GOOD_STANDING',
    'PSIRA_EMPLOYEE_REGISTRATION',
    'PSIRA_FEE_ASSESSMENT',
  ])
  category!: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  referenceNumber?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) issuedAt?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) expiresAt?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsIn(['A', 'B', 'C', 'D', 'E']) officerGrade?: string;
  @IsOptional() @Matches(/^\d{1,12}(\.\d{1,2})?$/) assessmentAmount?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  assessmentPeriod?: string;
  @IsOptional() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) liabilityPeriod?: string;
}
export class CompanyDocumentDecisionDto {
  @IsIn(['VERIFIED', 'REJECTED']) status!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
