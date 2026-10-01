import {
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class UpdateAttendanceIdentityStatusDto {
  @IsOptional()
  @IsBoolean()
  qrEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pinEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
