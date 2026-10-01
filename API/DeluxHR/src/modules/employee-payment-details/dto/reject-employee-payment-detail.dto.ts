import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectEmployeePaymentDetailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}
