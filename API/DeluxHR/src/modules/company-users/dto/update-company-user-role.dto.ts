import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateCompanyUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}