import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  Feature,
  Permission,
} from '@prisma/client';

import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { BulkCreateEmployeesDto } from './dto/bulk-create-employees.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeLifecycleReasonDto } from './dto/employee-lifecycle-reason.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.CORE_HR)
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
  ) {}

  @Post()
  @RequirePermissions(
    Permission.ADD_EMPLOYEES,
  )
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.create(
      user.organizationId,
      dto,
      user,
    );
  }

  @Post('bulk')
  @RequirePermissions(
    Permission.ADD_EMPLOYEES,
  )
  bulkCreate(
    @Body()
    dto: BulkCreateEmployeesDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.bulkCreate(
      user.organizationId,
      dto.employees,
      user,
    );
  }

  @Get()
  @RequirePermissions(
    Permission.VIEW_EMPLOYEES,
  )
  list(
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.list(
      user.organizationId,
    );
  }

  @Get(':employeeId')
  @RequirePermissions(
    Permission.VIEW_EMPLOYEES,
  )
  findOne(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.findOne(
      user.organizationId,
      employeeId,
    );
  }

  @Patch(':employeeId')
  @RequirePermissions(
    Permission.MANAGE_EMPLOYEES,
  )
  update(
    @Param('employeeId')
    employeeId: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.update(
      user.organizationId,
      employeeId,
      dto,
      user,
    );
  }

  @Post(':employeeId/activate')
  @RequirePermissions(
    Permission.APPROVE_EMPLOYEES,
  )
  activate(
    @Param('employeeId')
    employeeId: string,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.activate(
      user.organizationId,
      employeeId,
      user,
    );
  }

  @Post(':employeeId/suspend')
  @RequirePermissions(
    Permission.MANAGE_EMPLOYEES,
  )
  suspend(
    @Param('employeeId')
    employeeId: string,
    @Body()
    dto: EmployeeLifecycleReasonDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.suspend(
      user.organizationId,
      employeeId,
      dto.reason,
      user,
    );
  }

  @Post(':employeeId/reactivate')
  @RequirePermissions(
    Permission.MANAGE_EMPLOYEES,
  )
  reactivate(
    @Param('employeeId')
    employeeId: string,
    @Body()
    dto: EmployeeLifecycleReasonDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.reactivate(
      user.organizationId,
      employeeId,
      dto.reason,
      user,
    );
  }

  @Post(':employeeId/terminate')
  @RequirePermissions(
    Permission.MANAGE_EMPLOYEES,
  )
  terminate(
    @Param('employeeId')
    employeeId: string,
    @Body()
    dto: EmployeeLifecycleReasonDto,
    @CurrentTenantUser()
    user: TenantJwtUser,
  ) {
    return this.employeesService.terminate(
      user.organizationId,
      employeeId,
      dto.reason,
      user,
    );
  }
}
