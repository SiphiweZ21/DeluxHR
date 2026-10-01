import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  Feature,
  Permission,
} from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { OrganizationsService } from './organizations.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.CORE_HR)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get('current')
  findCurrent(
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.organizationsService.findOne(
      user.organizationId,
    );
  }

  @Patch('current/profile')
  @RequirePermissions(Permission.MANAGE_COMPANY)
  updateProfile(
    @Body() dto: UpdateCompanyProfileDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.organizationsService.updateProfile(
      user.organizationId,
      dto,
      user,
    );
  }
}
