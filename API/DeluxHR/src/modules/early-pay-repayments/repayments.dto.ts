import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
export class RepaymentPeriodDto {
  @IsString() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) period!: string;
}
export class PrepareRepaymentDto extends RepaymentPeriodDto {
  @IsOptional() @IsUUID() fundingProfileId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ledgerEntryIds!: string[];
  @IsDateString({ strict: true }) paymentDate!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class RepaymentActionDto extends BankingInspectDto {}
export class RepaymentDestinationDto extends RepaymentActionDto {
  @IsUUID() accountId!: string;
}
export class SubmitRepaymentDto extends RepaymentActionDto {
  @IsIn(['MANUAL_BANK_PORTAL']) method!: 'MANUAL_BANK_PORTAL';
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
}
export class RecordRepaymentReceiptDto extends RepaymentActionDto {
  @IsInt() @Min(1) @Max(2147483647) amountCents!: number;
  @IsString() @MinLength(3) @MaxLength(100) bankReference!: string;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
  @IsDateString({ strict: true }) receivedAt!: string;
}
export class DecideRepaymentReceiptDto extends RepaymentActionDto {
  @IsIn(['CONFIRMED', 'VOIDED']) decision!: 'CONFIRMED' | 'VOIDED';
}
