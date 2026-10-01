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

import { AttendanceIdentitiesService } from './attendance-identities.service';
import { SetAttendancePinDto } from './dto/set-attendance-pin.dto';
import { UpdateAttendanceIdentityStatusDto } from './dto/update-attendance-identity-status.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance-identities')
export class AttendanceIdentitiesController {
  constructor(
    private readonly attendanceIdentitiesService: AttendanceIdentitiesService,
  ) {}

  @Post('employees/:employeeId/provision')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  provision(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceIdentitiesService.provision(
      user.organizationId,
      employeeId,
      user,
    );
  }

  @Get('employees/:employeeId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  findForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceIdentitiesService.findForEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Post('employees/:employeeId/rotate-qr')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  rotateQr(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceIdentitiesService.rotateQr(
      user.organizationId,
      employeeId,
      user,
    );
  }

  @Post('employees/:employeeId/pin')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  setPin(
    @Param('employeeId') employeeId: string,
    @Body() dto: SetAttendancePinDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceIdentitiesService.setPin(
      user.organizationId,
      employeeId,
      dto.pin,
      user,
    );
  }

  @Post('employees/:employeeId/pin/clear')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  clearPin(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceIdentitiesService.clearPin(
      user.organizationId,
      employeeId,
      user,
    );
  }

  @Patch('employees/:employeeId/status')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  updateStatus(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateAttendanceIdentityStatusDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceIdentitiesService.updateStatus(
      user.organizationId,
      employeeId,
      dto,
      user,
    );
  }
}
