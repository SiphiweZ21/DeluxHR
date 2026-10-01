import { IsString, MinLength } from 'class-validator';

export class ApproveEmployeeCompensationChangeDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
