import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
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
import {
  AdjustmentDto,
  PaymentDecisionDto,
  PaymentDto,
  PeriodDto,
} from './payroll-liabilities.dto';
import { PayrollLiabilitiesService } from './payroll-liabilities.service';
@Controller('payroll-liabilities')
@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  OrganizationPermissionsGuard,
)
@RequireFeatures(Feature.PAYROLL)
export class PayrollLiabilitiesController {
  constructor(private readonly service: PayrollLiabilitiesService) {}
  @Get('register') @RequirePermissions(Permission.VIEW_PAYROLL) register(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Query() q: PeriodDto,
  ) {
    return this.service.register(actor, q.period);
  }
  @Get('remittances') @RequirePermissions(Permission.VIEW_PAYROLL) remittances(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Query() q: PeriodDto,
  ) {
    return this.service.register(actor, q.period);
  }
  @Get('reconciliation')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  reconciliation(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Query() q: PeriodDto,
  ) {
    return this.service.reconciliation(actor, q.period);
  }
  @Get('history') @RequirePermissions(Permission.VIEW_PAYROLL) history(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Query() q: PeriodDto,
  ) {
    return this.service.history(actor, q.period);
  }
  @Get('export.csv') @RequirePermissions(Permission.VIEW_PAYROLL) async csv(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Query() q: PeriodDto,
    @Res() res: Response,
  ) {
    const value = await this.service.csv(actor, q.period);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="DeluxHR-liabilities-${q.period}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(value);
  }
  @Post('adjustments')
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  adjustment(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: AdjustmentDto,
  ) {
    return this.service.adjustment(actor, dto);
  }
  @Post('payments') @RequirePermissions(Permission.MANAGE_PAYROLL) payment(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Body() dto: PaymentDto,
  ) {
    return this.service.payment(actor, dto);
  }
  @Patch('payments/:id') @RequirePermissions(Permission.MANAGE_PAYROLL) decide(
    @CurrentTenantUser() actor: TenantJwtUser,
    @Param('id') id: string,
    @Body() dto: PaymentDecisionDto,
  ) {
    return this.service.decide(actor, id, dto.status, dto.reason);
  }
}
