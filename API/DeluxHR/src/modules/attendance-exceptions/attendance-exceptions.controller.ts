import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Feature, Permission } from '@prisma/client';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { OrganizationWorkforceGuard } from '../../common/auth/organization-workforce.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { PermissionsGuard } from '../../common/access/permissions.guard';
import { RequirePermissions } from '../../common/access/require-permissions.decorator';

import { AttendanceExceptionsService } from './attendance-exceptions.service';
import { DetectMissingCheckoutDto } from './dto/detect-missing-checkout.dto';
import { AttendanceExceptionQueryDto } from './dto/attendance-exception-query.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
  OrganizationWorkforceGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/exceptions')
export class AttendanceExceptionsController {
  constructor(
    private readonly attendanceExceptionsService: AttendanceExceptionsService,
  ) {}

  @Post('detect/missing-checkouts')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  detectMissingCheckouts(
    @Body() dto: DetectMissingCheckoutDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceExceptionsService.detectMissingCheckouts(
      user,
      dto,
    );
  }

  @Get()
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(
    @Query() query: AttendanceExceptionQueryDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceExceptionsService.list(
      user.organizationId,
      query,
    );
  }
}
