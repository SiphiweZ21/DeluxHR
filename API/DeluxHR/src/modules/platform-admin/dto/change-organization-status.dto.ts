import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OrganizationStatus } from '@prisma/client';

export class ChangeOrganizationStatusDto {
  @IsEnum(OrganizationStatus)
  status!: OrganizationStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}