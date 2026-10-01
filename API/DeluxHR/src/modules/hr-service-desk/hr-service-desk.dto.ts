import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export class CategoryDto {
 @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) code!: string;
 @IsString() @MinLength(2) @MaxLength(100) name!: string;
 @IsInt() @Min(1) @Max(8760) responseSlaHours!: number;
 @IsInt() @Min(1) @Max(8760) resolutionSlaHours!: number;
 @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateRequestDto { @IsOptional() @IsUUID() categoryId?: string; @IsString() @MinLength(5) @MaxLength(500) summary!: string; }
export class CommentDto { @IsString() @MinLength(2) @MaxLength(3000) body!: string; @IsOptional() @IsBoolean() internal?: boolean; }
export class AssignmentDto { @IsUUID() userId!: string; }
export class PriorityDto { @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority!: string; }
export class StatusDto { @IsIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED']) status!: string; }
export class EscalateDto { @IsUUID() userId!: string; @IsString() @MinLength(5) @MaxLength(500) reason!: string; }
export class QueueDto {
 @IsOptional() @IsIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED']) status?: string;
 @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
 @IsOptional() @IsUUID() assignee?: string;
 @IsOptional() @IsUUID() categoryId?: string;
 @IsOptional() @IsIn(['true','false']) overdue?: string;
}
