import {
  Body,
  Controller,
  Get,
  Param,
  Query,
  Header,
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

import { AttendanceEventsService } from './attendance-events.service';
import { CreateAttendanceEventDto } from './dto/create-attendance-event.dto';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard, PermissionsGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance-events')
export class AttendanceEventsController {
  constructor(
    private readonly attendanceEventsService: AttendanceEventsService,
  ) {}

  // Foundation/admin capture endpoint. Channel-specific endpoints in later
  // 6A stages will call the same service rather than create separate engines.
  @Post()
  @RequirePermissions(Permission.MANAGE_ATTENDANCE)
  create(
    @Body() dto: CreateAttendanceEventDto,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceEventsService.create(user.organizationId, dto, user);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  list(@CurrentTenantUser() user: TenantJwtUser, @Query('page') page?: string) {
    return this.attendanceEventsService.list(user.organizationId, page);
  }

  @Get('employee/:employeeId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  listForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceEventsService.listForEmployee(
      user.organizationId,
      employeeId,
    );
  }

  @Get(':eventId')
  @RequirePermissions(Permission.VIEW_ATTENDANCE)
  findOne(
    @Param('eventId') eventId: string,
    @CurrentTenantUser() user: TenantJwtUser,
  ) {
    return this.attendanceEventsService.findOne(user.organizationId, eventId);
  }
}
