import { FeaturesGuard } from '../../../common/entitlements/features.guard';
import { RequireFeatures } from '../../../common/entitlements/require-features.decorator';
import { Feature, Permission } from '@prisma/client';
import { PermissionsGuard } from '../../../common/access/permissions.guard';
import { RequirePermissions } from '../../../common/access/require-permissions.decorator';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.LEAVE)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly service: LeaveTypesService) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_LEAVE)
  create(@Body() dto: CreateLeaveTypeDto, @CurrentTenantUser() user: TenantJwtUser) {
    return this.service.create(user.organizationId, dto);
  }

  @Get()
  @RequirePermissions(Permission.MANAGE_LEAVE)
  list(@CurrentTenantUser() user: TenantJwtUser) {
    return this.service.list(user.organizationId);
  }
}
