import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTimesheetEntryDto {
  @IsUUID()
  timesheetId: string;

  @IsDateString()
  workDate: string;

  @IsNumber()
  @Min(0)
  hoursWorked: number;

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