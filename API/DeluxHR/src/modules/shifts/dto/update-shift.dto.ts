import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
export class UpdateShiftDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1439) unpaidBreakMinutes?: number;
}
