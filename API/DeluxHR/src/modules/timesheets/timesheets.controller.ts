import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Feature, OvertimeApprovalStatus, Permission } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { OrganizationWorkforceGuard } from '../../common/auth/organization-workforce.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { TimesheetsService } from './timesheets.service';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { CreateTimesheetEntryDto } from './dto/create-timesheet-entry.dto';
import { UpdateTimesheetEntryDto } from './dto/update-timesheet-entry.dto';
import { GenerateTimesheetDto, ManualEntryDto, OvertimePolicyDto, PeriodDto, ReviewOvertimeDto, StatusDto } from './dto/phase-6c.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard, OrganizationWorkforceGuard)
@RequireFeatures(Feature.TIMESHEETS)
@Controller('timesheets')
export class TimesheetsController {
 constructor(private readonly service: TimesheetsService) {}
 @Post() @RequirePermissions(Permission.MANAGE_ATTENDANCE)
 create(@Body() dto: CreateTimesheetDto, @CurrentTenantUser() user: TenantJwtUser) { return this.service.create(user,dto); }
 @Post('generate') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
 generate(@Body() dto: GenerateTimesheetDto, @CurrentTenantUser() user: TenantJwtUser) { return this.service.generate(user,dto.employeeId,dto.periodStart,dto.periodEnd); }
 @Get() @RequirePermissions(Permission.VIEW_ATTENDANCE)
 list(@CurrentTenantUser() user: TenantJwtUser) { return this.service.listAll(user.organizationId); }
 @Get('employee/:employeeId') @RequirePermissions(Permission.VIEW_ATTENDANCE)
 byEmployee(@Param('employeeId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.listByEmployee(user.organizationId,id); }
 @Get('report') @RequirePermissions(Permission.VIEW_ATTENDANCE)
 report(@Query('periodStart') start: string,@Query('periodEnd') end: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.report(user.organizationId,start,end); }
 @Get('overtime-policy') @RequirePermissions(Permission.VIEW_ATTENDANCE)
 policy(@CurrentTenantUser() user: TenantJwtUser) { return this.service.policy(user.organizationId); }
 @Patch('overtime-policy') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
 setPolicy(@Body() dto: OvertimePolicyDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.setPolicy(user,dto.dailyThresholdMinutes,dto.maxDailyOvertimeMinutes,dto.requireApproval); }
 @Get('overtime-approvals') @RequirePermissions(Permission.VIEW_ATTENDANCE)
 approvals(@CurrentTenantUser() user: TenantJwtUser,@Query('status') status?: OvertimeApprovalStatus) { return this.service.overtimeQueue(user.organizationId,status); }
 @Post('overtime-approvals/:id/review') @RequirePermissions(Permission.APPROVE_TIMESHEETS)
 reviewOvertime(@Param('id') id: string,@Body() dto: ReviewOvertimeDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.reviewOvertime(user,id,dto.status,dto.approvedMinutes,dto.reason); }
 @Post('period-lock') @RequirePermissions(Permission.APPROVE_TIMESHEETS)
 lock(@Body() dto: PeriodDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.lockPeriod(user,dto.periodStart,dto.periodEnd); }
 @Get(':id') @RequirePermissions(Permission.VIEW_ATTENDANCE)
 one(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.findOne(user.organizationId,id); }
 @Get(':id/adjustments') @RequirePermissions(Permission.VIEW_ATTENDANCE)
 adjustments(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.adjustments(user.organizationId,id); }
 @Patch(':id/status') @RequirePermissions(Permission.APPROVE_TIMESHEETS)
 status(@Param('id') id: string,@Body() dto: StatusDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.status(user,id,dto.status); }
 @Post('entries') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
 add(@Body() dto: CreateTimesheetEntryDto,@Query('reason') reason: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.addEntry(user,dto,reason); }
 @Patch('entries/:entryId') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
 update(@Param('entryId') id: string,@Body() dto: UpdateTimesheetEntryDto,@Query('reason') reason: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.updateEntry(user,id,dto,reason); }
 @Delete('entries/:entryId') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
 remove(@Param('entryId') id: string,@Query('reason') reason: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.deleteEntry(user,id,reason); }
}
