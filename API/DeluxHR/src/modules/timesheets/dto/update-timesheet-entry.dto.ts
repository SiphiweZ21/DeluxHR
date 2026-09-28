import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateTimesheetEntryDto {
  @IsOptional()
  @IsDateString()
  workDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursWorked?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  taskCode?: string;
}