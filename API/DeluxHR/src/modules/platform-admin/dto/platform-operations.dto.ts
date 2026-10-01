import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Feature, UserRole } from '@prisma/client';
export class PackageDto {
 @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) code!: string;
 @IsString() @MinLength(2) @MaxLength(100) name!: string;
 @IsOptional() @IsString() @MaxLength(500) description?: string;
 @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsEnum(Feature,{ each: true }) features!: Feature[];
 @IsOptional() @IsInt() @Min(1) @Max(1000000) employeeLimit?: number;
 @IsOptional() @IsBoolean() isActive?: boolean;
}
export class SubscriptionDto {
 @IsUUID() packageId!: string;
 @IsIn(['ACTIVE','PAUSED','CANCELLED']) status!: string;
 @IsOptional() @IsDateString() endsAt?: string;
 @IsString() @MinLength(8) @MaxLength(500) reason!: string;
}
export class PlatformUserDto {
 @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
 @IsEmail() email!: string;
 @IsString() @MinLength(12) @MaxLength(128) password!: string;
 @IsIn([UserRole.PLATFORM_ADMIN,UserRole.COMPANY_ADMIN]) role!: UserRole;
 @IsOptional() @IsUUID() organizationId?: string;
}
export class PlatformUserStatusDto { @IsBoolean() isActive!: boolean; @IsString() @MinLength(8) @MaxLength(500) reason!: string; }
export class SupportSessionDto { @IsUUID() targetUserId!: string; @IsString() @MinLength(12) @MaxLength(500) reason!: string; }
export class ConfigDto { @IsString() @MinLength(1) @MaxLength(1000) value!: string; }
