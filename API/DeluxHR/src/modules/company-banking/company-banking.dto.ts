import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CompanyPaymentPurpose } from '@prisma/client';
export class CreateBankingProfileDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MaxLength(60) adapterId!: string;
  @IsString() @MinLength(2) @MaxLength(100) accountHolder!: string;
  @IsString() @Matches(/^[0-9]{6,20}$/) accountNumber!: string;
  @IsString() @Matches(/^[0-9]{6}$/) branchCode!: string;
  @IsIn(['CURRENT', 'SAVINGS', 'TRANSMISSION']) accountType!: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9 -]{1,40}$/)
  originatorId?: string;
  @IsString() @Matches(/^[A-Za-z0-9 /-]{1,20}$/) ownReference!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class BankingDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class BankingReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class BankingDefaultDto extends BankingReasonDto {
  @IsEnum(CompanyPaymentPurpose) purpose!: CompanyPaymentPurpose;
  @IsUUID() profileId!: string;
}

export class BankingInspectDto extends BankingReasonDto {
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}
