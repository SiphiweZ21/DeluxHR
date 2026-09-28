import { IsEnum } from 'class-validator';

export enum TimesheetStatusDto {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class UpdateTimesheetStatusDto {
  @IsEnum(TimesheetStatusDto)
  status: TimesheetStatusDto;
}