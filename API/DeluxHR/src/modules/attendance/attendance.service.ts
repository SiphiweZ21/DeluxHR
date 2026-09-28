// attendance.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async clockIn(organizationId: string, employeeId: string) {
    // prevent double clock-in
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        clockOut: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Employee already clocked in');
    }

    const now = new Date();

    return this.prisma.attendanceRecord.create({
      data: {
        organizationId,
        employeeId,
        clockIn: now,
        workDate: new Date(now.toDateString()),
      },
    });
  }

  async clockOut(attendanceId: string) {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { id: attendanceId },
    });

    if (!record || record.clockOut) {
      throw new BadRequestException('Invalid clock-out request');
    }

    return this.prisma.attendanceRecord.update({
      where: { id: attendanceId },
      data: {
        clockOut: new Date(),
      },
    });
  }

  async getRecords(organizationId: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { organizationId },
      include: {
        employee: true,
      },
      orderBy: {
        clockIn: 'desc',
      },
    });
  }
}