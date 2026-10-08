import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { DataScope, Permission } from '@prisma/client';

export class UserPermissionDto {
  @IsOptional() @IsBoolean() denied?: boolean;
  @IsEnum(Permission)
  permission!: Permission;

  @IsEnum(DataScope)
  scope!: DataScope;
}

export class SetUserPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserPermissionDto)
  permissions!: UserPermissionDto[];
}
