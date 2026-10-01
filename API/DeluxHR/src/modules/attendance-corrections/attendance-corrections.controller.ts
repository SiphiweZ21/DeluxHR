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

import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { CreateAttendanceCorrectionDto } from './dto/create-attendance-correction.dto';
import { ResolveAttendanceExceptionDto } from './dto/resolve-attendance-exception.dto';

@UseGuards(
  JwtAuthGuard,
  TenantAccessGuard,
  FeaturesGuard,
  PermissionsGuard,
)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance/corrections')
export class AttendanceCorrectionsController {
  constructor(
    private readonly service: AttendanceCorrectionsService,
  ) {}

  @Post('events/:eventId')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  correct(
    @Param('eventId') eventId: string,
    @Body() dto: CreateAttendanceCorrectionDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.service.correctEvent(user, eventId, dto);
  }

  @Get('events/:eventId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  getCorrection(
    @Param('eventId') eventId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.service.getCorrection(user.organizationId, eventId);
  }

  @Post('exceptions/:exceptionId/resolve')
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  resolveException(
    @Param('exceptionId') exceptionId: string,
    @Body() dto: ResolveAttendanceExceptionDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.service.resolveException(user, exceptionId, dto);
  }
}
