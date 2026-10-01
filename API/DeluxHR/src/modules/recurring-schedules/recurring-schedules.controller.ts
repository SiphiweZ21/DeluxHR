import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto, EndRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('recurring-schedules')
export class RecurringSchedulesController {
  constructor(private readonly service: RecurringSchedulesService) {}
  @Post() @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(@Body() dto: CreateRecurringScheduleDto, @CurrentTenantUser() user: TenantJwtUser) { return this.service.create(user, dto); }
  @Get() @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string) { return this.service.list(user.organizationId, employeeId, departmentId); }
  @Get('effective/:employeeId') @RequirePermissions(Permission.VIEW_ATTENDANCE)
  effective(@Param('employeeId') id: string, @Query('date') date: string, @CurrentTenantUser() user: TenantJwtUser) { return this.service.effective(user.organizationId, id, date); }
  @Patch(':id/end') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  end(@Param('id') id: string, @Body() dto: EndRecurringScheduleDto, @CurrentTenantUser() user: TenantJwtUser) { return this.service.end(user, id, dto); }
}
