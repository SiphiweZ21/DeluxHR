import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { Feature, Permission } from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateEarningDto } from './dto/create-earning.dto';
import { UpdateEarningStatusDto } from './dto/update-earning-status.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.PAYROLL)
@RequirePermissions(Permission.VIEW_PAYROLL)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  create(
    @Body() dto: CreateEarningDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.earningsService.create(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentTenantUser() user: TenantJwtUser) {
    return this.earningsService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.earningsService.listByEmployee(user.organizationId, employeeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.earningsService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateEarningStatusDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.earningsService.updateStatus(user.organizationId, id, dto);
  }

  @Post('generate-from-timesheet/:timesheetId')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  generateFromTimesheet(
    @Param('timesheetId') timesheetId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.earningsService.generateFromTimesheet(
      user.organizationId,
      timesheetId,
    );
  }
}
