import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../../common/entitlements/features.guard';
import { RequireFeatures } from '../../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../../common/access/permissions.guard';
import { RequirePermissions } from '../../../common/access/require-permissions.decorator';
import { LeavePolicyService } from './leave-policy.service';
import { AdjustLeaveBalanceDto, AssignLeavePolicyDto, CreateLeavePolicyDto, CreatePublicHolidayDto, EndLeavePolicyAssignmentDto, LeaveDatesDto } from './dto/leave-policy.dto';
import { calendarDate } from '../../recurring-schedules/recurring-schedules.service';
@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.LEAVE)
@Controller('leave-policy')
export class LeavePolicyController {
 constructor(private readonly service: LeavePolicyService) {}
 @Post('policies') @RequirePermissions(Permission.MANAGE_LEAVE)
 create(@Body() dto: CreateLeavePolicyDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.create(user,dto); }
 @Get('policies') @RequirePermissions(Permission.MANAGE_LEAVE)
 list(@CurrentTenantUser() user: TenantJwtUser) { return this.service.list(user.organizationId); }
 @Patch('policies/:id/activate') @RequirePermissions(Permission.MANAGE_LEAVE)
 activate(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.setActive(user,id,true); }
 @Patch('policies/:id/deactivate') @RequirePermissions(Permission.MANAGE_LEAVE)
 deactivate(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.setActive(user,id,false); }
 @Post('assignments') @RequirePermissions(Permission.MANAGE_LEAVE)
 assign(@Body() dto: AssignLeavePolicyDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.assign(user,dto); }
 @Get('assignments/:employeeId') @RequirePermissions(Permission.MANAGE_LEAVE)
 assignments(@Param('employeeId') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.assignments(user.organizationId,id); }
 @Patch('assignments/:id/end') @RequirePermissions(Permission.MANAGE_LEAVE)
 endAssignment(@Param('id') id: string,@Body() dto: EndLeavePolicyAssignmentDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.endAssignment(user,id,dto.effectiveTo); }
 @Post('adjustments') @RequirePermissions(Permission.MANAGE_LEAVE)
 adjust(@Body() dto: AdjustLeaveBalanceDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.adjust(user,dto); }
 @Get('balances/:employeeId/:leaveTypeId') @RequirePermissions(Permission.MANAGE_LEAVE)
 balance(@Param('employeeId') employeeId: string,@Param('leaveTypeId') leaveTypeId: string,@Query('asOf') asOf: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.balance(user.organizationId,employeeId,leaveTypeId,calendarDate(asOf)); }
 @Post('holidays') @RequirePermissions(Permission.MANAGE_LEAVE)
 holiday(@Body() dto: CreatePublicHolidayDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.addHoliday(user,dto); }
 @Get('holidays') @RequirePermissions(Permission.MANAGE_LEAVE)
 holidays(@Query('from') from: string,@Query('to') to: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.holidays(user.organizationId,calendarDate(from),calendarDate(to)); }
 @Delete('holidays/:id') @RequirePermissions(Permission.MANAGE_LEAVE)
 deleteHoliday(@Param('id') id: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.removeHoliday(user,id); }
 @Post('working-days') @RequirePermissions(Permission.MANAGE_LEAVE)
 workingDays(@Body() dto: LeaveDatesDto,@CurrentTenantUser() user: TenantJwtUser) { return this.service.workingDaysForEmployee(user.organizationId,dto.employeeId,dto.leaveTypeId,calendarDate(dto.startDate),calendarDate(dto.endDate)); }
 @Get('calendar') @RequirePermissions(Permission.MANAGE_LEAVE)
 calendar(@Query('from') from: string,@Query('to') to: string,@CurrentTenantUser() user: TenantJwtUser) { return this.service.calendar(user.organizationId,calendarDate(from),calendarDate(to)); }
}
