import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ApproveEmployeePaymentDetailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}
