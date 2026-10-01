import { PreparePaymentDto } from './dto/prepare-payment.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import type { Response } from 'express';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { PayrollPaymentsService } from './payroll-payments.service';
import type { PayrollPaymentExportAdapterId } from './export/payment-export.types';
import { SubmitPayrollPaymentBatchDto } from './dto/submit-payroll-payment-batch.dto';
import { RecordPayrollPaymentResultsDto } from './dto/record-payroll-payment-results.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  OrganizationPermissionsGuard,
)
@RequireFeatures(Feature.PAYROLL)
@Controller('payroll-payments')
export class PayrollPaymentsController {
  constructor(
    private readonly payrollPaymentsService: PayrollPaymentsService,
  ) {}

  @Get('payroll-batches/:payrollBatchId/readiness')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  getReadiness(
    @Param('payrollBatchId') payrollBatchId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.getReadiness(
      user.organizationId,
      payrollBatchId,
    );
  }

  @Get('funding-profiles')
  @RequirePermissions(Permission.PREPARE_PAYROLL_PAYMENTS)
  fundingProfiles(@CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollPaymentsService.fundingProfiles(user.organizationId);
  }
  @Post('batches/:payrollBatchId/prepare')
  @RequirePermissions(Permission.PREPARE_PAYROLL_PAYMENTS)
  prepare(
    @Body() dto: PreparePaymentDto,
    @Param('payrollBatchId') payrollBatchId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.prepareFromLockedPayroll(
      user.organizationId,
      payrollBatchId,
      user,
      dto?.fundingProfileId,
    );
  }

  @Post('batches/:id/approve-for-export')
  @RequirePermissions(Permission.APPROVE_PAYROLL_PAYMENTS)
  approveForExport(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.approveForExport(
      user.organizationId,
      id,
      user,
    );
  }

  @Get('export-adapters')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  listExportAdapters() {
    return this.payrollPaymentsService.listExportAdapters();
  }

  @Get('batches/:id/export-validation/:adapterId')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  validateExport(
    @Param('id') id: string,
    @Param('adapterId') adapterId: PayrollPaymentExportAdapterId,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.validateExport(
      user.organizationId,
      id,
      adapterId,
    );
  }

  @Post('batches/:id/export/:adapterId')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  async generateExport(
    @Param('id') id: string,
    @Param('adapterId') adapterId: PayrollPaymentExportAdapterId,
    @CurrentTenantUser() user: TenantJwtUser,
    @Res() response: Response,
  ) {
    const generated = await this.payrollPaymentsService.generateExportFile(
      user.organizationId,
      id,
      adapterId,
      user,
    );

    response.setHeader('Content-Type', generated.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.fileName}"`,
    );
    response.setHeader('X-DeluxHR-Export-Reference', generated.exportReference);
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.send(generated.content);
  }

  @Post('batches/:id/report')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  async report(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollPaymentsService.generateReport(
      user.organizationId,
      id,
      user,
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.content);
  }
  @Post('batches/:id/draft/:adapterId')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  async draft(
    @Param('id') id: string,
    @Param('adapterId') adapterId: PayrollPaymentExportAdapterId,
    @CurrentTenantUser() user: TenantJwtUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollPaymentsService.generateDraft(
      user.organizationId,
      id,
      adapterId,
      user,
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-DeluxHR-Draft', 'NOT-FOR-BANK-UPLOAD');
    response.send(file.content);
  }
  @Post('batches/:id/submit-to-bank')
  @RequirePermissions(Permission.CONFIRM_PAYROLL_PAYMENTS)
  submitToBank(
    @Param('id') id: string,
    @Body() dto: SubmitPayrollPaymentBatchDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.submitToBank(
      user.organizationId,
      id,
      user,
      dto,
    );
  }

  @Post('batches/:id/payment-results')
  @RequirePermissions(Permission.CONFIRM_PAYROLL_PAYMENTS)
  recordPaymentResults(
    @Param('id') id: string,
    @Body() dto: RecordPayrollPaymentResultsDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.recordPaymentResults(
      user.organizationId,
      id,
      user,
      dto.results,
    );
  }

  @Get('batches/:id/reconciliation')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  getReconciliation(
    @Param('id') id: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.payrollPaymentsService.getReconciliation(
      user.organizationId,
      id,
    );
  }

  @Post('batches/:id/reconcile')
  @RequirePermissions(Permission.CONFIRM_PAYROLL_PAYMENTS)
  reconcile(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollPaymentsService.reconcile(user.organizationId, id, user);
  }

  @Get('batches')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  list(@CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollPaymentsService.list(user.organizationId);
  }

  @Get('batches/:id')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  findOne(@Param('id') id: string, @CurrentTenantUser() user: TenantJwtUser) {
    return this.payrollPaymentsService.findOne(user.organizationId, id);
  }
}
