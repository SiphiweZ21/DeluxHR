import {
  IsBoolean,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateOrganizationFeatureDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(3)
  reason!: string;
}
