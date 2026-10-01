import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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

import { AttendancePoliciesService } from './attendance-policies.service';
import { CreateAttendancePolicyDto } from './dto/create-attendance-policy.dto';
import { UpdateAttendancePolicyDto } from './dto/update-attendance-policy.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance-policies')
export class AttendancePoliciesController {
  constructor(
    private readonly attendancePoliciesService: AttendancePoliciesService,
  ) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(
    @Body() dto: CreateAttendancePolicyDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendancePoliciesService.create(
      user.organizationId,
      dto,
      user,
    );
  }

  @Get()
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser) {
    return this.attendancePoliciesService.list(user.organizationId);
  }

  @Get(':policyId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  findOne(
    @Param('policyId') policyId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendancePoliciesService.findOne(
      user.organizationId,
      policyId,
    );
  }

  @Patch(':policyId')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  update(
    @Param('policyId') policyId: string,
    @Body() dto: UpdateAttendancePolicyDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendancePoliciesService.update(
      user.organizationId,
      policyId,
      dto,
      user,
    );
  }

  @Post(':policyId/deactivate')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  deactivate(
    @Param('policyId') policyId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendancePoliciesService.setActive(
      user.organizationId,
      policyId,
      false,
      user,
    );
  }

  @Post(':policyId/activate')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  activate(
    @Param('policyId') policyId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendancePoliciesService.setActive(
      user.organizationId,
      policyId,
      true,
      user,
    );
  }
}
