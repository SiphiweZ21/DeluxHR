import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { UpdateTimesheetStatusDto } from './dto/update-timesheet-status.dto';
import { CreateTimesheetEntryDto } from './dto/create-timesheet-entry.dto';
import { UpdateTimesheetEntryDto } from './dto/update-timesheet-entry.dto';

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateTimesheetDto) {
    return this.prisma.timesheet.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
      },
    });
  }

  async listAll(organizationId: string) {
    return this.prisma.timesheet.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        entries: true,
      },
    });
  }

  async listByEmployee(organizationId: string, employeeId: string) {
    return this.prisma.timesheet.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: { periodStart: 'desc' },
      include: {
        entries: true,
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        entries: true,
      },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    return timesheet;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateTimesheetStatusDto,
  ) {
    await this.findOne(organizationId, id);

    const statusData: Record<string, any> = {
      status: dto.status as any,
    };

    if (dto.status === 'SUBMITTED') {
      statusData.submittedAt = new Date();
    }

    if (dto.status === 'APPROVED') {
      statusData.approvedAt = new Date();
    }

    if (dto.status === 'REJECTED') {
      statusData.rejectedAt = new Date();
    }

    return this.prisma.timesheet.update({
      where: { id },
      data: statusData,
    });
  }

  async addEntry(organizationId: string, dto: CreateTimesheetEntryDto) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: {
        id: dto.timesheetId,
        organizationId,
      },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    const entry = await this.prisma.timesheetEntry.create({
      data: {
        timesheetId: dto.timesheetId,
        workDate: new Date(dto.workDate),
        hoursWorked: dto.hoursWorked,
        overtimeHours: dto.overtimeHours ?? 0,
        description: dto.description,
        projectCode: dto.projectCode,
        taskCode: dto.taskCode,
      },
    });

    await this.recalculateTotals(dto.timesheetId);

    return entry;
  }

  async updateEntry(
    organizationId: string,
    entryId: string,
    dto: UpdateTimesheetEntryDto,
  ) {
    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id: entryId },
      include: {
        timesheet: true,
      },
    });

    if (!entry || entry.timesheet.organizationId !== organizationId) {
      throw new NotFoundException('Timesheet entry not found');
    }

    const updatedEntry = await this.prisma.timesheetEntry.update({
      where: { id: entryId },
      data: {
        workDate: dto.workDate ? new Date(dto.workDate) : undefined,
        hoursWorked: dto.hoursWorked,
        overtimeHours: dto.overtimeHours,
        description: dto.description,
        projectCode: dto.projectCode,
        taskCode: dto.taskCode,
      },
    });

    await this.recalculateTotals(entry.timesheetId);

    return updatedEntry;
  }

  async deleteEntry(organizationId: string, entryId: string) {
    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id: entryId },
      include: {
        timesheet: true,
      },
    });

    if (!entry || entry.timesheet.organizationId !== organizationId) {
      throw new NotFoundException('Timesheet entry not found');
    }

    await this.prisma.timesheetEntry.delete({
      where: { id: entryId },
    });

    await this.recalculateTotals(entry.timesheetId);

    return { message: 'Timesheet entry deleted successfully' };
  }

  async recalculateTotals(timesheetId: string) {
    const entries = await this.prisma.timesheetEntry.findMany({
      where: { timesheetId },
    });

    const totalHours = entries.reduce(
      (sum, entry) => sum + entry.hoursWorked + entry.overtimeHours,
      0,
    );

    const uniqueDays = new Set(
      entries.map((entry) => new Date(entry.workDate).toDateString()),
    ).size;

    return this.prisma.timesheet.update({
      where: { id: timesheetId },
      data: {
        totalHours,
        totalDays: uniqueDays,
      },
    });
  }
}