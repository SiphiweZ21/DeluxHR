import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class CreateRecurringScheduleDto {
  @IsUUID() shiftId!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() workLocationId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) weekdays!: number[];
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsInt() @Min(0) @Max(240) graceInMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(240) graceOutMinutes?: number;
}
export class EndRecurringScheduleDto { @IsDateString() effectiveTo!: string; }
