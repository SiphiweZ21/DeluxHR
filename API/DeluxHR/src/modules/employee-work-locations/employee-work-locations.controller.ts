import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { AssignEmployeeWorkLocationDto } from './dto/assign-employee-work-location.dto';
import { EmployeeWorkLocationsService } from './employee-work-locations.service';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('employees/:employeeId/work-locations')
export class EmployeeWorkLocationsController {
  constructor(
    private readonly employeeWorkLocationsService: EmployeeWorkLocationsService,
  ) {}

  @Post('assign')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  assign(
    @Param('employeeId') employeeId: string,
    @Body() dto: AssignEmployeeWorkLocationDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.employeeWorkLocationsService.assign(
      user.organizationId,
      employeeId,
      dto,
      user,
    );
  }

  @Get()
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.employeeWorkLocationsService.list(
      user.organizationId,
      employeeId,
    );
  }

  @Get('current')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  current(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.employeeWorkLocationsService.current(
      user.organizationId,
      employeeId,
    );
  }
}
