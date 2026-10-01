import {
  Body,
  Controller,
  Get,
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

import { AttendanceWebService } from './attendance-web.service';
import { WebAttendanceDto } from './dto/web-attendance.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/web')
export class AttendanceWebController {
  constructor(
    private readonly attendanceWebService: AttendanceWebService,
  ) {}

  @Get('status')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  status(@CurrentTenantUser() user: TenantJwtUser) {
    return this.attendanceWebService.status(user);
  }

  @Post('check-in')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  checkIn(
    @Body() dto: WebAttendanceDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceWebService.checkIn(user, dto);
  }

  @Post('check-out')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  checkOut(
    @Body() dto: WebAttendanceDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceWebService.checkOut(user, dto);
  }
}
