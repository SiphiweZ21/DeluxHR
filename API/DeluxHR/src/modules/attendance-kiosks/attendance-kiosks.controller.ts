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

import { AttendanceKiosksService } from './attendance-kiosks.service';
import { CreateAttendanceKioskDto } from './dto/create-attendance-kiosk.dto';
import { KioskQrAttendanceDto } from './dto/kiosk-qr-attendance.dto';
import { KioskPinAttendanceDto } from './dto/kiosk-pin-attendance.dto';

@Controller('attendance/kiosks')
export class AttendanceKiosksController {
  constructor(
    private readonly attendanceKiosksService: AttendanceKiosksService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.ATTENDANCE)
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(
    @Body() dto: CreateAttendanceKioskDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceKiosksService.create(
      user.organizationId,
      dto,
      user,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.ATTENDANCE)
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser) {
    return this.attendanceKiosksService.list(user.organizationId);
  }

  @Post(':kioskId/rotate-secret')
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.ATTENDANCE)
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  rotateSecret(
    @Param('kioskId') kioskId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceKiosksService.rotateSecret(
      user.organizationId,
      kioskId,
      user,
    );
  }

  @Post(':kioskId/deactivate')
  @UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
  @RequireFeatures(Feature.ATTENDANCE)
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  deactivate(
    @Param('kioskId') kioskId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceKiosksService.setActive(
      user.organizationId,
      kioskId,
      false,
      user,
    );
  }

  // Public kiosk endpoints authenticate using deviceCode + deviceSecret.
  // They do not use an employee's web/JWT session.
  @Post('clock/qr')
  qrClock(@Body() dto: KioskQrAttendanceDto) {
    return this.attendanceKiosksService.clockByQr(dto);
  }

  @Post('clock/pin')
  pinClock(@Body() dto: KioskPinAttendanceDto) {
    return this.attendanceKiosksService.clockByPin(dto);
  }
}
