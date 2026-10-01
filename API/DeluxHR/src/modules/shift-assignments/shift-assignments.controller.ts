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
import { ShiftAssignmentsService } from './shift-assignments.service';
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { EndShiftAssignmentDto } from './dto/end-shift-assignment.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('shift-assignments')
export class ShiftAssignmentsController {
  constructor(private readonly assignments: ShiftAssignmentsService) {}
  @Post() @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(@Body() dto: CreateShiftAssignmentDto, @CurrentTenantUser() user: TenantJwtUser) { return this.assignments.create(user.organizationId, dto, user); }
  @Get() @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string) { return this.assignments.list(user.organizationId, employeeId, departmentId); }
  @Get('effective/:employeeId') @RequirePermissions(Permission.VIEW_ATTENDANCE)
  effective(@Param('employeeId') employeeId: string, @Query('date') date: string | undefined, @CurrentTenantUser() user: TenantJwtUser) { return this.assignments.effective(user.organizationId, employeeId, date); }
  @Patch(':assignmentId/end') @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  end(@Param('assignmentId') id: string, @Body() dto: EndShiftAssignmentDto, @CurrentTenantUser() user: TenantJwtUser) { return this.assignments.end(user.organizationId, id, dto, user); }
}
