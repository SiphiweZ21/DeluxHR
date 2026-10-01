import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveApproverKind, LeaveChangeKind, LeaveDecisionStatus, LeaveDocumentKind, LeaveChangeStatus } from '@prisma/client';
export class ApprovalStepDto { @IsEnum(LeaveApproverKind) kind!: LeaveApproverKind; @IsUUID() approverUserId!: string; }
export class CreateWorkflowDto {
 @IsUUID() leaveTypeId!: string;
 @IsString() @MaxLength(120) name!: string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => ApprovalStepDto) steps!: ApprovalStepDto[];
}
export class CreateDelegationDto { @IsUUID() fromUserId!: string; @IsUUID() toUserId!: string; @IsDateString() effectiveFrom!: string; @IsDateString() effectiveTo!: string; }
export class DecisionDto { @IsEnum(LeaveDecisionStatus) status!: LeaveDecisionStatus; @IsString() @MaxLength(1000) comment!: string; }
export class CommentDto { @IsString() @MaxLength(2000) text!: string; @IsOptional() @IsBoolean() internal?: boolean; }
export class ChangeDto { @IsEnum(LeaveChangeKind) kind!: LeaveChangeKind; @IsOptional() @IsDateString() proposedStart?: string; @IsOptional() @IsDateString() proposedEnd?: string; @IsString() @MaxLength(1000) reason!: string; }
export class ReviewChangeDto { @IsEnum(LeaveChangeStatus) status!: LeaveChangeStatus; @IsString() @MaxLength(1000) note!: string; }
export class DocumentKindDto { @IsEnum(LeaveDocumentKind) kind!: LeaveDocumentKind; }
