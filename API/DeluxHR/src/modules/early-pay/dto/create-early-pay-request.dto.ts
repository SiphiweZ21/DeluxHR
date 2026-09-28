import { IsEnum, IsNumber, IsPositive, IsString } from 'class-validator';

export enum EarlyPayTransferTypeDto {
  STANDARD = 'STANDARD',
  INSTANT = 'INSTANT',
}

export class CreateEarlyPayRequestDto {
  @IsString()
  employeeId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(EarlyPayTransferTypeDto)
  transferType: EarlyPayTransferTypeDto;
}
