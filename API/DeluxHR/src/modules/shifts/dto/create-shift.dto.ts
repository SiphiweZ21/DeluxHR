import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateShiftDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MaxLength(120) name!: string;
  // Local wall-clock time; overnight shifts have endTime before startTime.
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsInt() @Min(0) @Max(1439) unpaidBreakMinutes!: number;
}
