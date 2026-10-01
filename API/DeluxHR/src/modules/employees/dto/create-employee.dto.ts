import { EmploymentType, IdentityType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsDateString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsDateString({ strict: true }) employmentStartDate?: string;
  @IsOptional() @IsDateString({ strict: true }) employmentEndDate?: string;
  @IsOptional() @IsEnum(IdentityType) identityType?: IdentityType;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  identityNumber?: string;

  @IsUUID()
  departmentId!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
