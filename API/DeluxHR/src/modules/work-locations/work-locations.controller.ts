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

import { WorkLocationsService } from './work-locations.service';
import { CreateWorkLocationDto } from './dto/create-work-location.dto';
import { UpdateWorkLocationDto } from './dto/update-work-location.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('work-locations')
export class WorkLocationsController {
  constructor(
    private readonly workLocationsService: WorkLocationsService,
  ) {}

  @Post()
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(
    @Body() dto: CreateWorkLocationDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.workLocationsService.create(
      user.organizationId,
      dto,
      user,
    );
  }

  @Get()
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser) {
    return this.workLocationsService.list(user.organizationId);
  }

  @Get(':locationId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  findOne(
    @Param('locationId') locationId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.workLocationsService.findOne(
      user.organizationId,
      locationId,
    );
  }

  @Patch(':locationId')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  update(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateWorkLocationDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.workLocationsService.update(
      user.organizationId,
      locationId,
      dto,
      user,
    );
  }

  @Post(':locationId/deactivate')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  deactivate(
    @Param('locationId') locationId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.workLocationsService.setActive(
      user.organizationId,
      locationId,
      false,
      user,
    );
  }

  @Post(':locationId/activate')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  activate(
    @Param('locationId') locationId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.workLocationsService.setActive(
      user.organizationId,
      locationId,
      true,
      user,
    );
  }
}
