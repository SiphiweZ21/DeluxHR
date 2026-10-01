import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectEmployeeCompensationChangeDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
