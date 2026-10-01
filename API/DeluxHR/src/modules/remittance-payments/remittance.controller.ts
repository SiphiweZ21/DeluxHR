import {
  Body,
  Controller,
  Get,
  Header,
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
import { AllowPendingOnboarding } from '../../common/auth/allow-pending-onboarding.decorator';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';

import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { RemittancePaymentsService } from './remittance.service';
import {
  RemittancePeriodDto,
  PrepareRemittanceDto,
  RemittanceActionDto,
  SubmitRemittanceDto,
  RemittanceResultDto,
  CreateBeneficiaryDto,
  ReviewBeneficiaryDto,
} from './remittance.dto';
@Controller('remittance-payments')
@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  OrganizationPermissionsGuard,
)
@RequireFeatures(Feature.PAYROLL)
export class RemittancePaymentsController {
  constructor(private readonly s: RemittancePaymentsService) {}
  @Header('Cache-Control', 'private, no-store')
  @Get('workspace')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  register(
    @CurrentTenantUser() a: TenantJwtUser,
    @Query() q: RemittancePeriodDto,
  ) {
    return this.s.workspace(a, q.period);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('batches/:id')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  detail(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.s.detail(a, id);
  }
  @Post('batches')
  @RequirePermissions(Permission.PREPARE_PAYROLL_PAYMENTS)
  prepare(
    @CurrentTenantUser() a: TenantJwtUser,
    @Body() d: PrepareRemittanceDto,
  ) {
    return this.s.prepare(a, d);
  }
  @Post('batches/:id/approve')
  @RequirePermissions(Permission.APPROVE_PAYROLL_PAYMENTS)
  approve(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemittanceActionDto,
  ) {
    return this.s.approve(a, id, d);
  }
  @Post('batches/:id/cancel')
  @RequirePermissions(Permission.PREPARE_PAYROLL_PAYMENTS)
  cancel(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemittanceActionDto,
  ) {
    return this.s.cancel(a, id, d);
  }
  @Post('batches/:id/submit')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  submit(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SubmitRemittanceDto,
  ) {
    return this.s.submit(a, id, d);
  }
  @Post('batches/:id/result')
  @RequirePermissions(Permission.APPROVE_PAYROLL_PAYMENTS)
  result(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemittanceResultDto,
  ) {
    return this.s.result(a, id, d);
  }
  @Post('batches/:id/inspect')
  @RequirePermissions(Permission.EXPORT_PAYROLL_PAYMENTS)
  inspect(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemittanceActionDto,
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

@Controller('remittance-beneficiaries')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
@AllowPendingOnboarding()
export class RemittanceBeneficiariesController {
  constructor(private readonly s: RemittancePaymentsService) {}
  @Header('Cache-Control', 'private, no-store')
  @Get()
  profiles(@CurrentTenantUser() a: TenantJwtUser) {
    return this.s.profiles(a);
  }
  @Post() create(
    @CurrentTenantUser() a: TenantJwtUser,
    @Body() d: CreateBeneficiaryDto,
  ) {
    return this.s.create(a, d);
  }
  @Post(':id/inspect') inspect(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemittanceActionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.s.inspectProfile(a, id, d);
  }
  @Post(':id/review') review(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReviewBeneficiaryDto,
  ) {
    return this.s.review(a, id, d);
  }
  @Post(':id/retire') retire(
    @CurrentTenantUser() a: TenantJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemittanceActionDto,
  ) {
    return this.s.retire(a, id, d);
  }
}
