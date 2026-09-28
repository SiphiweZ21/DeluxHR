import { Injectable, NotFoundException } from '@nestjs/common';
import { EarningType, PayrollItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEarningDto } from './dto/create-earning.dto';
import { UpdateEarningStatusDto } from './dto/update-earning-status.dto';

@Injectable()
export class EarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateEarningDto) {
    return this.prisma.earning.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        ...(dto.payrollRunId ? { payrollRunId: dto.payrollRunId } : {}),
        title: dto.title,
        type: dto.type as EarningType,
        source: dto.source,
        payPeriodStart: new Date(dto.payPeriodStart),
        payPeriodEnd: new Date(dto.payPeriodEnd),
        earnedDate: new Date(dto.earnedDate),
        units: dto.units,
        rate: dto.rate,
        amount: dto.amount,
        currency: dto.currency ?? 'ZAR',
      },
      include: {
        employee: true,
        payrollRun: true,
      },
    });
  }

  async listAll(organizationId: string) {
    return this.prisma.earning.findMany({
      where: { organizationId },
      include: {
        employee: true,
        payrollRun: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listByEmployee(organizationId: string, employeeId: string) {
    return this.prisma.earning.findMany({
      where: {
        organizationId,
        employeeId,
      },
      include: {
        employee: true,
        payrollRun: true,
      },
      orderBy: { earnedDate: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const earning = await this.prisma.earning.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        employee: true,
        payrollRun: true,
      },
    });

    if (!earning) {
      throw new NotFoundException('Earning not found');
    }

    return earning;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateEarningStatusDto,
  ) {
    await this.findOne(organizationId, id);

    return this.prisma.earning.update({
      where: { id },
      data: {
        status: dto.status as PayrollItemStatus,
      },
      include: {
        employee: true,
        payrollRun: true,
      },
    });
  }


  async generateFromTimesheet(organizationId: string, timesheetId: string) {
  const timesheet = await this.prisma.timesheet.findFirst({
    where: {
      id: timesheetId,
      organizationId,
    },
    include: {
      employee: true,
      entries: true,
    },
  });

  if (!timesheet) {
    throw new NotFoundException('Timesheet not found');
  }

  const overtimeHours = timesheet.entries.reduce(
    (sum, entry) => sum + entry.overtimeHours,
    0,
  );

  const regularHours = timesheet.totalHours - overtimeHours;

  const regularRate = 120;
  const overtimeRate = 180;

  await this.prisma.earning.deleteMany({
    where: {
      organizationId,
      employeeId: timesheet.employeeId,
      source: `TIMESHEET:${timesheet.id}`,
    },
  });

  const earnings = await this.prisma.earning.createMany({
    data: [
      {
        organizationId,
        employeeId: timesheet.employeeId,
        title: 'Regular hours',
        type: 'SALARY',
        source: `TIMESHEET:${timesheet.id}`,
        payPeriodStart: timesheet.periodStart,
        payPeriodEnd: timesheet.periodEnd,
        earnedDate: new Date(),
        units: regularHours,
        rate: regularRate,
        amount: regularHours * regularRate,
        currency: 'ZAR',
      },
      {
        organizationId,
        employeeId: timesheet.employeeId,
        title: 'Overtime hours',
        type: 'OVERTIME',
        source: `TIMESHEET:${timesheet.id}`,
        payPeriodStart: timesheet.periodStart,
        payPeriodEnd: timesheet.periodEnd,
        earnedDate: new Date(),
        units: overtimeHours,
        rate: overtimeRate,
        amount: overtimeHours * overtimeRate,
        currency: 'ZAR',
      },
    ],
  });
  return earnings;
  }
}