import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
export class EnrolWhatsAppDto { @IsUUID() employeeId!: string; @Matches(/^\d{6,8}$/) pin!: string; }
export class CreateAnnouncementDto { @IsString() @MinLength(3) @MaxLength(120) title!: string; @IsString() @MinLength(3) @MaxLength(2000) body!: string; @IsOptional() @IsDateString() expiresAt?: string; }
export class UpdateHrRequestDto { @IsIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED']) status!: string; }
