import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeePaymentDetailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bankName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  accountHolderName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  accountNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  branchCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string;
}
