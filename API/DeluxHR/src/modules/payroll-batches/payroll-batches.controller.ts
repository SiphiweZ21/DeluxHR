import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { CreatePayrollBatchDto } from './dto/create-payroll-batch.dto';
import { PayrollBatchesService } from './payroll-batches.service';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  OrganizationPermissionsGuard,
)
@RequireFeatures(Feature.PAYROLL)
@Controller('payroll-batches')
export class PayrollBatchesController {
  constructor(private readonly payrollBatchesService: PayrollBatchesService) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  create(
    @Body() dto: CreatePayrollBatchDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollBatchesService.create(user.organizationId, dto, user);
  }

  @Get()
  @RequirePermissions(Permission.VIEW_PAYROLL)
  list(@CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.list(user.organizationId);
  }

  @Post(':id/generate')
  @RequirePermissions(Permission.GENERATE_PAYROLL)
  generate(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.generateBulk(
      user.organizationId,
      id,
      user,
    );
  }

  @Get(':id/eligibility')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  eligibility(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollBatchesService.evaluateEligibility(
      user.organizationId,
      id,
    );
  }

  @Get(':id/review')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  reviewDetails(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollBatchesService.getReview(user.organizationId, id);
  }

  @Post(':id/review')
  @RequirePermissions(Permission.REVIEW_PAYROLL)
  review(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.review(user.organizationId, id, user);
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.APPROVE_PAYROLL)
  approve(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.approve(user.organizationId, id, user);
  }

  @Post(':id/lock')
  @RequirePermissions(Permission.APPROVE_PAYROLL)
  lock(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.lock(user.organizationId, id, user);
  }

  @Post(':id/payslips/generate')
  @RequirePermissions(Permission.GENERATE_PAYROLL)
  generatePayslips(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollBatchesService.generateBulkPayslips(
      user.organizationId,
      id,
      user,
    );
  }

  @Get(':id/payslips')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  listPayslips(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollBatchesService.listBatchPayslips(
      user.organizationId,
      id,
    );
  }

  @Get(':id/totals')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  totals(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.getBatchTotals(user.organizationId, id);
  }

  @Get(':id')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  findOne(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollBatchesService.findOne(user.organizationId, id);
  }
}
