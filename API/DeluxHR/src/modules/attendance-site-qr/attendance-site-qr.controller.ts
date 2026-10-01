import {
  Body,
  Controller,
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

import { AttendanceSiteQrService } from './attendance-site-qr.service';
import { SiteQrAttendanceDto } from './dto/site-qr-attendance.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/site-qr')
export class AttendanceSiteQrController {
  constructor(
    private readonly attendanceSiteQrService: AttendanceSiteQrService,
  ) {}

  @Post('locations/:workLocationId/provision')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  provision(
    @Param('workLocationId') workLocationId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceSiteQrService.provision(
      user.organizationId,
      workLocationId,
      user,
    );
  }

  @Post('locations/:workLocationId/rotate')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  rotate(
    @Param('workLocationId') workLocationId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceSiteQrService.rotate(
      user.organizationId,
      workLocationId,
      user,
    );
  }

  @Post('clock')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  clock(
    @Body() dto: SiteQrAttendanceDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceSiteQrService.clock(user, dto);
  }
}
