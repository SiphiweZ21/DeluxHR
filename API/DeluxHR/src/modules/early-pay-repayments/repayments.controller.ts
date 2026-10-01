import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { PlatformRoleGuard } from '../../common/auth/platform-role.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import { CurrentPlatformUser } from '../../common/auth/current-platform-user.decorator';
import type {
  PlatformJwtUser,
  TenantJwtUser,
} from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { EarlyPayRepaymentsService } from './repayments.service';
import {
  RepaymentPeriodDto,
  PrepareRepaymentDto,
  RepaymentActionDto,
  SubmitRepaymentDto,
  RepaymentDestinationDto,
  RecordRepaymentReceiptDto,
  DecideRepaymentReceiptDto,
} from './repayments.dto';
@Controller('early-pay-repayments')
@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  OrganizationPermissionsGuard,
)
@RequireFeatures(Feature.PAYROLL)
export class EarlyPayRepaymentsController {
  constructor(private readonly s: EarlyPayRepaymentsService) {}
  @Get('register') @RequirePermissions(Permission.VIEW_PAYROLL) register(
    @CurrentTenantUser() a: TenantJwtUser,
    @Query() q: RepaymentPeriodDto,
  ) {
    return this.s.register(a, q.period);
  }
  @Get('batches/:id') @RequirePermissions(Permission.VIEW_PAYROLL) detail(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.s.detail(a, id);
  }
  @Post('batches')
  @RequirePermissions(Permission.PREPARE_PAYROLL_PAYMENTS)
  prepare(
    @CurrentTenantUser() a: TenantJwtUser,
    @Body() d: PrepareRepaymentDto,
  ) {
    return this.s.prepare(a, d);
  }
  @Post('batches/:id/approve')
  @RequirePermissions(Permission.APPROVE_PAYROLL_PAYMENTS)
  approve(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RepaymentActionDto,
  ) {
    return this.s.approve(a, id, d);
  }
  @Post('batches/:id/cancel')
  @RequirePermissions(Permission.PREPARE_PAYROLL_PAYMENTS)
  cancel(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RepaymentActionDto,
  ) {
    return this.s.cancel(a, id, d);
  }
  @Post('batches/:id/submit')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  submit(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SubmitRepaymentDto,
  ) {
    return this.s.submit(a, id, d);
  }
  @Post('batches/:id/inspect')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  inspect(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RepaymentActionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.s.inspect(a, id, d);
  }
  @Post('batches/:id/report')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  report(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.file(a, id, 'report', res);
  }
  @Post('batches/:id/draft')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  draft(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.file(a, id, 'draft', res);
  }
  @Post('batches/:id/export')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  export() {
    return this.s.productionExport();
  }
  private async file(
    a: TenantJwtUser,
    id: string,
    kind: 'report' | 'draft',
    res: Response,
  ) {
    const f = await this.s.download(a, id, kind);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-File-SHA256', f.sha256);
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    return res.send(f.content);
  }
}
@Controller('platform-admin/early-pay-repayments')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
export class PlatformEarlyPayRepaymentsController {
  constructor(private readonly s: EarlyPayRepaymentsService) {}
  @Get() workspace(@CurrentPlatformUser() a: PlatformJwtUser) {
    return this.s.platformWorkspace(a);
  }
  @Post('destination') destination(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Body() d: RepaymentDestinationDto,
  ) {
    return this.s.destination(a, d);
  }
  @Post('batches/:id/receipts') receipt(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RecordRepaymentReceiptDto,
  ) {
    return this.s.receipt(a, id, d);
  }
  @Post('batches/:id/receipts/:receiptId/decision') decide(
    @CurrentPlatformUser() a: PlatformJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Body() d: DecideRepaymentReceiptDto,
  ) {
    return this.s.decideReceipt(a, id, receiptId, d);
  }
}
