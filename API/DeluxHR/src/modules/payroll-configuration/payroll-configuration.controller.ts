import { Permission } from '@prisma/client';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { AllowFeatureSetup } from '../../common/entitlements/allow-feature-setup.decorator';
import { AllowPendingOnboarding } from '../../common/auth/allow-pending-onboarding.decorator';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { Feature } from '@prisma/client';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { PayrollConfigurationService } from './payroll-configuration.service';
import {
  AssignBenefitDto,
  AssignDeductionDto,
  CreateBenefitPlanDto,
  CreateDeductionDefinitionDto,
  UpdatePayrollSettingsDto,
  UpsertPayrollProfileDto,
} from './dto/payroll-configuration.dto';
@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.PAYROLL)
@RequirePermissions(Permission.VIEW_PAYROLL)
@AllowFeatureSetup()
@AllowPendingOnboarding()
@Controller('payroll-configuration')
export class PayrollConfigurationController {
  constructor(private s: PayrollConfigurationService) {}
  @Get('settings') settings(@CurrentTenantUser() u: TenantJwtUser) {
    return this.s.settings(u.organizationId);
  }
  @Patch('settings')
  @RequirePermissions(Permission.MANAGE_PAYROLL) update(
    @Body() d: UpdatePayrollSettingsDto,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.updateSettings(u.organizationId, d);
  }
  @Get('profiles') profiles(@CurrentTenantUser() u: TenantJwtUser) {
    return this.s.profiles(u.organizationId);
  }
  @Get('profiles/:employeeId') profile(
    @Param('employeeId') e: string,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.profile(u.organizationId, e);
  }
  @Patch('profiles/:employeeId')
  @RequirePermissions(Permission.MANAGE_PAYROLL) upsert(
    @Param('employeeId') e: string,
    @Body() d: UpsertPayrollProfileDto,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.upsertProfile(u.organizationId, e, d);
  }
  @Get('benefits') benefits(@CurrentTenantUser() u: TenantJwtUser) {
    return this.s.benefits(u.organizationId);
  }
  @Post('benefits')
  @RequirePermissions(Permission.MANAGE_PAYROLL) createBenefit(
    @Body() d: CreateBenefitPlanDto,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.createBenefit(u.organizationId, d);
  }
  @Post('profiles/:employeeId/benefits')
  @RequirePermissions(Permission.MANAGE_PAYROLL) assignBenefit(
    @Param('employeeId') e: string,
    @Body() d: AssignBenefitDto,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.assignBenefit(u.organizationId, e, d);
  }
  @Delete('employee-benefits/:id')
  @RequirePermissions(Permission.MANAGE_PAYROLL) removeBenefit(
    @Param('id') id: string,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.removeBenefit(u.organizationId, id);
  }
  @Get('deductions') deductions(@CurrentTenantUser() u: TenantJwtUser) {
    return this.s.deductions(u.organizationId);
  }
  @Post('deductions')
  @RequirePermissions(Permission.MANAGE_PAYROLL) createDeduction(
    @Body() d: CreateDeductionDefinitionDto,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.createDeduction(u.organizationId, d);
  }
  @Post('profiles/:employeeId/deductions')
  @RequirePermissions(Permission.MANAGE_PAYROLL) assignDeduction(
    @Param('employeeId') e: string,
    @Body() d: AssignDeductionDto,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.assignDeduction(u.organizationId, e, d);
  }
  @Delete('employee-deductions/:id')
  @RequirePermissions(Permission.MANAGE_PAYROLL) removeDeduction(
    @Param('id') id: string,
    @CurrentTenantUser() u: TenantJwtUser,
  ) {
    return this.s.removeDeduction(u.organizationId, id);
  }
}
