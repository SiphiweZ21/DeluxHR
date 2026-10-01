import {
  Controller,
  Get,
  Param,
  Query,
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

import { AttendanceHistoryService } from './attendance-history.service';
import { AttendanceHistoryQueryDto } from './dto/attendance-history-query.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/history')
export class AttendanceHistoryController {
  constructor(
    private readonly attendanceHistoryService: AttendanceHistoryService,
  ) {}

  @Get('me')
  @RequirePermissions(Permission.VIEW_SELF)
  myHistory(
    @Query() query: AttendanceHistoryQueryDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceHistoryService.myHistory(
      user,
      query,
    );
  }

  @Get('employees/:employeeId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  employeeHistory(
    @Param('employeeId') employeeId: string,
    @Query() query: AttendanceHistoryQueryDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceHistoryService.employeeHistory(
      user,
      employeeId,
      query,
    );
  }

  @Get()
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  organizationHistory(
    @Query() query: AttendanceHistoryQueryDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceHistoryService.organizationHistory(
      user,
      query,
    );
  }
}
