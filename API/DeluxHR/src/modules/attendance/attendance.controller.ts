import { FeaturesGuard } from '../../common/entitlements/features.guard';
import { RequireFeatures } from '../../common/entitlements/require-features.decorator';
import { Feature } from '@prisma/client';
// attendance.controller.ts
import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../common/auth/tenant-access.guard';
import { CurrentTenantUser } from '../../common/auth/current-tenant-user.decorator';

@UseGuards(JwtAuthGuard, TenantAccessGuard, FeaturesGuard)
@RequireFeatures(Feature.ATTENDANCE)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@Body() dto: ClockInDto, @CurrentTenantUser() user: any) {
    return this.attendanceService.clockIn(user.organizationId, dto.employeeId);
  }

  @Post('clock-out')
  clockOut(@Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(dto.attendanceId);
  }

  @Get()
  getRecords(@CurrentTenantUser() user: any) {
    return this.attendanceService.getRecords(user.organizationId);
  }
}