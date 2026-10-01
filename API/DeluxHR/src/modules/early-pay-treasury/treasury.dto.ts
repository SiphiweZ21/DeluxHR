import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CreateBankingProfileDto,
  BankingInspectDto,
} from '../company-banking/company-banking.dto';
export class CreateFundingDto extends CreateBankingProfileDto {}
export class TreasuryActionDto extends BankingInspectDto {}
export class FundingReviewDto extends TreasuryActionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
}
export class PreparePayoutDto {
  @IsUUID() fundingAccountId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  requestIds!: string[];
  @IsDateString({ strict: true }) paymentDate!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class SubmitPayoutDto extends TreasuryActionDto {
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
  @IsIn(['MANUAL_BANK_PORTAL']) method!: 'MANUAL_BANK_PORTAL';
}
export class PayoutResultDto extends TreasuryActionDto {
  @IsIn(['PAID', 'FAILED']) outcome!: 'PAID' | 'FAILED';
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
}
