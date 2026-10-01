import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeCompensationChangeDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pensionableSalary?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
