import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';

import { ApproveEmployeePaymentDetailDto } from './dto/approve-employee-payment-detail.dto';
import { CreateEmployeePaymentDetailDto } from './dto/create-employee-payment-detail.dto';
import { RejectEmployeePaymentDetailDto } from './dto/reject-employee-payment-detail.dto';
import { EmployeePaymentDetailsService } from './employee-payment-details.service';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.PAYROLL)
@Controller('employees/:employeeId/payment-details')
export class EmployeePaymentDetailsController {
  constructor(
    private readonly paymentDetailsService: EmployeePaymentDetailsService,
  ) {}

  @Get()
  @RequirePermissions(Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS)
  history(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.paymentDetailsService.history(user.organizationId, employeeId);
  }

  @Get('current')
  @RequirePermissions(Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS)
  current(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.paymentDetailsService.current(user.organizationId, employeeId);
  }

  @Get('pending')
  @RequirePermissions(Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS)
  pending(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.paymentDetailsService.pending(user.organizationId, employeeId);
  }

  @Post()
  @RequirePermissions(Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS)
  submit(
    @Param('employeeId')
    employeeId: string,
    @Body()
    dto: CreateEmployeePaymentDetailDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.paymentDetailsService.submit(
      user.organizationId,
      employeeId,
      dto,
      {
        id: user.sub,
        email: user.email,
        role: user.role,
      },
    );
  }

  @Post(':paymentDetailId/approve')
  @RequirePermissions(Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS)
  approve(
    @Param('employeeId')
    employeeId: string,
    @Param('paymentDetailId')
    paymentDetailId: string,
    @Body()
    dto: ApproveEmployeePaymentDetailDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.paymentDetailsService.approve(
      user.organizationId,
      employeeId,
      paymentDetailId,
      dto.password,
      {
        id: user.sub,
        email: user.email,
        role: user.role,
      },
    );
  }

  @Post(':paymentDetailId/reject')
  @RequirePermissions(Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS)
  reject(
    @Param('employeeId')
    employeeId: string,
    @Param('paymentDetailId')
    paymentDetailId: string,
    @Body()
    dto: RejectEmployeePaymentDetailDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.paymentDetailsService.reject(
      user.organizationId,
      employeeId,
      paymentDetailId,
      dto.reason,
      dto.password,
      {
        id: user.sub,
        email: user.email,
        role: user.role,
      },
    );
  }
}
