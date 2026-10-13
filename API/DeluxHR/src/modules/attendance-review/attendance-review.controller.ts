import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { AllowPendingOnboarding } from '../../common/auth/allow-pending-onboarding.decorator';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { AttendanceReviewService } from './attendance-review.service';
class SiteRoutingDto {
  @IsUUID() workLocationId!: string;
  @IsUUID() reviewerUserId!: string;
  @IsOptional() @IsIn(['STRICT', 'REVIEW', 'FLEXIBLE']) locationMode?: string;
}
export class ReviewSettingsDto {
  @IsOptional() @IsBoolean() whatsappAlerts?: boolean;
  @IsBoolean() enabled!: boolean;
  @IsIn(['STRICT', 'REVIEW', 'FLEXIBLE']) locationMode!: string;
  @IsInt() @Min(1) @Max(240) reminderMinutes!: number;
  @IsInt() @Min(2) @Max(480) supervisorMinutes!: number;
  @IsInt() @Min(3) @Max(720) escalationMinutes!: number;
  @IsOptional() @IsUUID() reviewerUserId?: string;
  @IsOptional() @IsUUID() operationsUserId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SiteRoutingDto)
  siteRouting?: SiteRoutingDto[];
}
export class ReviewAttemptDto {
  @IsIn(['ACCEPT', 'REJECT', 'REQUEST_LOCATION']) action!:
    | 'ACCEPT'
    | 'REJECT'
    | 'REQUEST_LOCATION';
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
  @IsOptional() @IsUUID() workLocationId?: string;
}
class ExplainDto {
  @IsString() @MinLength(5) @MaxLength(1000) explanation!: string;
}
@Controller('attendance/review')
@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.ATTENDANCE)
export class AttendanceReviewController {
  constructor(private readonly service: AttendanceReviewService) {}
  @Get('settings')
  @AllowPendingOnboarding()
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  settings(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.settings(actor.organizationId);
  }
  @Get('choices')
  @AllowPendingOnboarding()
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  choices(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.choices(actor);
  }
  @Post('settings')
  @AllowPendingOnboarding()
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  save(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: ReviewSettingsDto,
  ) {
    return this.service.configure(actor, dto);
  }
  @Get('attempts')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  attempts(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.attempts(actor);
  }
  @Post('attempts/:id/review')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  review(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id') id: string,
    @Body() dto: ReviewAttemptDto,
  ) {
    return this.service.review(actor, id, dto);
  }
  @Post('attempts/:id/explain')
  explain(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id') id: string,
    @Body() dto: ExplainDto,
  ) {
    return this.service.explain(actor, id, dto.explanation);
  }
  @Post('scan')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  scan(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.monitor(actor.organizationId, true);
  }
  @Get('alerts') alerts(@CurrentTenantUser() actor: TenantJwtUser) {
    return this.service.alerts(actor);
  }
  @Post('alerts/:id/read') read(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id') id: string,
  ) {
    return this.service.readAlert(actor, id);
  }
}
