import { IsDateString, IsOptional, IsUUID } from 'class-validator';
export class CreateShiftAssignmentDto {
  @IsUUID() shiftId!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
