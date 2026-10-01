import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BankingInspectDto } from '../company-banking/company-banking.dto';
export class RemittancePeriodDto {
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) period!: string;
}
export class CreateBeneficiaryDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsIn(['BANK_TRANSFER', 'SARS_EFILING', 'UIF_PORTAL']) route!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) creditorName?: string;
  @IsOptional() @IsBoolean() uifViaSars?: boolean;
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  registrationEvidence?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9 /-]{1,20}$/) payeeReference?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) bankName?: string;
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  accountHolder?: string;
  @IsOptional() @Matches(/^\d{6,20}$/) accountNumber?: string;
  @IsOptional() @Matches(/^\d{6}$/) branchCode?: string;
  @IsOptional()
  @IsIn(['CURRENT', 'SAVINGS', 'TRANSMISSION'])
  accountType?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class RemittanceActionDto extends BankingInspectDto {}
export class ReviewBeneficiaryDto extends RemittanceActionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
}
export class PrepareRemittanceDto extends RemittancePeriodDto {
  @IsUUID() beneficiaryId!: string;
  @IsOptional() @IsUUID() fundingProfileId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) amountCents?: number;
  @IsDateString({ strict: true }) paymentDate!: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  officialReference?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) declaredPaymentCents?: number;
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  declarationEvidence?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class SubmitRemittanceDto extends RemittanceActionDto {
  @IsIn(['MANUAL_BANK_PORTAL', 'SARS_EFILING', 'UIF_PORTAL']) method!: string;
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
}
export class RemittanceResultDto extends RemittanceActionDto {
  @IsIn(['PAID', 'FAILED', 'MISMATCH']) outcome!:
    | 'PAID'
    | 'FAILED'
    | 'MISMATCH';
  @IsInt() @Min(0) @Max(1000000000) actualPaidCents!: number;
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
  @IsDateString({ strict: true }) paidAt!: string;
}
