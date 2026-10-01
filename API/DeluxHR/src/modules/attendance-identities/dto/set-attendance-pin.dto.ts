import {
  IsString,
  Matches,
} from 'class-validator';

export class SetAttendancePinDto {
  @IsString()
  @Matches(/^\d{4,8}$/, {
    message: 'Attendance PIN must contain 4 to 8 digits',
  })
  pin!: string;
}
