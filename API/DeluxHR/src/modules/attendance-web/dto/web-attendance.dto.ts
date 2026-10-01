import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class WebAttendanceDto {
  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  locationAccuracyM?: number;
}
