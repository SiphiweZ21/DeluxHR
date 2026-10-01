import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class TeamDto { @IsString() @MinLength(2) @MaxLength(100) name!: string; @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all',{ each: true }) employeeIds!: string[]; }
export class AnnouncementDto {
 @IsString() @MinLength(3) @MaxLength(120) title!: string;
 @IsString() @MinLength(3) @MaxLength(3000) body!: string;
 @IsIn(['COMPANY','DEPARTMENT','LOCATION','TEAM']) audience!: string;
 @IsOptional() @IsUUID() departmentId?: string;
 @IsOptional() @IsUUID() workLocationId?: string;
 @IsOptional() @IsUUID() teamId?: string;
 @IsOptional() @IsDateString() publishedAt?: string;
 @IsOptional() @IsDateString() expiresAt?: string;
 @IsOptional() @IsBoolean() important?: boolean;
 @IsOptional() @IsBoolean() pinned?: boolean;
 @IsOptional() @IsBoolean() requiresAcknowledgement?: boolean;
}
export class AnnouncementStateDto { @IsBoolean() isActive!: boolean; }
