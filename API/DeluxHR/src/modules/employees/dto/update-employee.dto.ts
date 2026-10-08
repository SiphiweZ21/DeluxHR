import { Transform } from 'class-transformer';
import { EmploymentType, IdentityType } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional() @IsString() employeeCode?: string | null;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @IsEmail()
  email?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsDateString()
  employmentStartDate?: string;

  @IsOptional()
  @IsDateString()
  employmentEndDate?: string;

  @IsOptional()
  @IsEnum(IdentityType)
  identityType?: IdentityType;

  @IsOptional()
  @IsString()
  identityNumber?: string;
}
