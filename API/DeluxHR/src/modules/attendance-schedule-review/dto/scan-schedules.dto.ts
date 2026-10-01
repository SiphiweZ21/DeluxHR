import { IsDateString, IsOptional, IsUUID } from 'class-validator';
export class ScanSchedulesDto {
 @IsDateString() from!: string;
 @IsDateString() to!: string;
 @IsOptional() @IsUUID() employeeId?: string;
}
