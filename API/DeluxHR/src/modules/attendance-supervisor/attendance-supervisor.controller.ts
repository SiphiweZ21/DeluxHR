import {
  Body,
  Controller,
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

import { AttendanceSupervisorService } from './attendance-supervisor.service';
import { SupervisorAttendanceDto } from './dto/supervisor-attendance.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/supervisor')
export class AttendanceSupervisorController {
  constructor(
    private readonly attendanceSupervisorService: AttendanceSupervisorService,
  ) {}

  @Post('clock')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  clock(
    @Body() dto: SupervisorAttendanceDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceSupervisorService.clock(
      user,
      dto,
    );
  }
}
