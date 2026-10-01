import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class AssignEmployeeWorkLocationDto {
  @IsUUID()
  workLocationId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}
