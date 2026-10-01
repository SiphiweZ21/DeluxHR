import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { AttendanceScheduleReviewService } from './attendance-schedule-review.service';
import { ScanSchedulesDto } from './dto/scan-schedules.dto';
import { ExplainExceptionDto } from './dto/explain-exception.dto';
@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/schedule-review')
export class AttendanceScheduleReviewController {
  constructor(private readonly service: AttendanceScheduleReviewService) {}
  @Post('scan') @UseGuards(PermissionsGuard) @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  scan(@Body() dto: ScanSchedulesDto, @CurrentTenantUser() user: TenantJwtUser) { return this.service.scan(user, dto); }
  @Post('exceptions/:id/explanation')
  explain(@Param('id') id: string, @Body() dto: ExplainExceptionDto, @CurrentTenantUser() user: TenantJwtUser) { return this.service.explain(user, id, dto); }
}
