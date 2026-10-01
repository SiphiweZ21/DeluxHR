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

import { ApproveEmployeeCompensationChangeDto } from './dto/approve-employee-compensation-change.dto';
import { CreateEmployeeCompensationChangeDto } from './dto/create-employee-compensation-change.dto';
import { RejectEmployeeCompensationChangeDto } from './dto/reject-employee-compensation-change.dto';
import { EmployeeCompensationChangesService } from './employee-compensation-changes.service';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.PAYROLL)
@Controller('employees/:employeeId/compensation-changes')
export class EmployeeCompensationChangesController {
  constructor(
    private readonly compensationChangesService: EmployeeCompensationChangesService,
  ) {}

  @Get()
  @RequirePermissions(Permission.VIEW_PAYROLL)
  history(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.compensationChangesService.history(
      user.organizationId,
      employeeId,
    );
  }

  @Get('pending')
  @RequirePermissions(Permission.VIEW_PAYROLL)
  pending(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.compensationChangesService.pending(
      user.organizationId,
      employeeId,
    );
  }

  @Post()
  @RequirePermissions(Permission.MANAGE_PAYROLL)
  submit(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEmployeeCompensationChangeDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.compensationChangesService.submit(
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

  @Post(':compensationChangeId/approve')
  @RequirePermissions(Permission.APPROVE_PAYROLL)
  approve(
    @Param('employeeId') employeeId: string,
    @Param('compensationChangeId') compensationChangeId: string,
    @Body() dto: ApproveEmployeeCompensationChangeDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.compensationChangesService.approve(
      user.organizationId,
      employeeId,
      compensationChangeId,
      dto.password,
      {
        id: user.sub,
        email: user.email,
        role: user.role,
      },
    );
  }

  @Post(':compensationChangeId/reject')
  @RequirePermissions(Permission.APPROVE_PAYROLL)
  reject(
    @Param('employeeId') employeeId: string,
    @Param('compensationChangeId') compensationChangeId: string,
    @Body() dto: RejectEmployeeCompensationChangeDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.compensationChangesService.reject(
      user.organizationId,
      employeeId,
      compensationChangeId,
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
