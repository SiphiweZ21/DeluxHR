import { IsDateString, IsUUID } from 'class-validator';

export class CreateTimesheetDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}