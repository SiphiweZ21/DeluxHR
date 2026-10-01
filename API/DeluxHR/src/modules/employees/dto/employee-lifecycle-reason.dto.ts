import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class EmployeeLifecycleReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
