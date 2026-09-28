// attendance.controller.ts
import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@Body() dto: ClockInDto, @CurrentUser() user: any) {
    return this.attendanceService.clockIn(user.organizationId, dto.employeeId);
  }

  @Post('clock-out')
  clockOut(@Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(dto.attendanceId);
  }

  @Get()
  getRecords(@CurrentUser() user: any) {
    return this.attendanceService.getRecords(user.organizationId);
  }
}