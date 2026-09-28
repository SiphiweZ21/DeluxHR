import { IsDateString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId!: string;

  @IsUUID()
  @IsNotEmpty()
  leaveTypeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
