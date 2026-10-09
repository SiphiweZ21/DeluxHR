import { AccessControlService } from '../../common/access/access-control.service';
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
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollRunStatusDto } from './dto/update-payroll-run-status.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.PAYROLL)
@RequirePermissions(Permission.VIEW_PAYROLL)
@Controller('payroll-runs')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService, private readonly access: AccessControlService) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  create(
    @Body() dto: CreatePayrollRunDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollService.create(user.organizationId, dto);
  }

  @Get()
  listAll(@CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollService.listAll(user.organizationId);
  }

  @Get('employee/:employeeId')
  listByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollService.listByEmployee(user.organizationId, employeeId);
  }

  @Get(':id/ledger')
  async ledger(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    const run = await this.payrollService.findOne(user.organizationId, id);
    return run.ledgerEntries ?? [];
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollService.findOne(user.organizationId, id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollRunStatusDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    const required = dto.status === 'APPROVED' || dto.status === 'LOCKED' ? Permission.APPROVE_PAYROLL : dto.status === 'REVIEWED' ? Permission.REVIEW_PAYROLL : dto.status === 'PAYMENT_PROCESSING' ? Permission.PREPARE_PAYROLL_PAYMENTS : dto.status === 'PAID' ? Permission.CONFIRM_PAYROLL_PAYMENTS : Permission.MANAGE_PAYROLL;
    await this.access.requirePermission(user, required);
    return this.payrollService.updateStatus(
      user.organizationId,
      id,
      dto,
      user.sub,
    );
  }

  @Patch(':id/recalculate')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  recalculate(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollService.recalculateTotals(
      user.organizationId,
      id,
      user.sub,
    );
  }

  @Post('generate')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  generate(
    @Body() dto: CreatePayrollRunDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollService.generateFromEarnings(
      user.organizationId,
      dto,
      user.sub,
    );
  }
}
