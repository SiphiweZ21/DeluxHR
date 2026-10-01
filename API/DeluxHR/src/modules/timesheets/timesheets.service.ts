import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OvertimeApprovalStatus, PayrollBatchStatus, Prisma, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecurringSchedulesService, calendarDate } from '../recurring-schedules/recurring-schedules.service';
import { localInstant } from '../attendance-schedule-review/attendance-schedule-review.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { CreateTimesheetEntryDto } from './dto/create-timesheet-entry.dto';
import { UpdateTimesheetEntryDto } from './dto/update-timesheet-entry.dto';

export function calculateDailyHours(elapsedMinutes: number, unpaidBreakMinutes: number, scheduledMinutes: number, thresholdMinutes: number, capMinutes: number) {
  if (!Number.isInteger(elapsedMinutes) || elapsedMinutes < 0 || elapsedMinutes > 1440) throw new BadRequestException('Invalid attendance duration');
  if (![unpaidBreakMinutes, scheduledMinutes, thresholdMinutes, capMinutes].every(v => Number.isInteger(v) && v >= 0 && v <= 1440)) throw new BadRequestException('Invalid hours policy');
  const breakMinutes = Math.min(unpaidBreakMinutes, elapsedMinutes);
  const workedMinutes = elapsedMinutes - breakMinutes;
  const overtimeMinutes = Math.max(0, workedMinutes - Math.max(scheduledMinutes || thresholdMinutes, thresholdMinutes));
  if (overtimeMinutes > capMinutes) throw new BadRequestException('Overtime exceeds daily policy cap');
  return { regularHours: (workedMinutes-overtimeMinutes)/60, overtimeHours: overtimeMinutes/60, breakHours: breakMinutes/60, scheduledHours: scheduledMinutes/60 };
}

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly schedules: RecurringSchedulesService) {}
  private async log(user: TenantJwtUser, entity: string, id: string, action: string, reason?: string) {
    await this.audit.log({ organizationId: user.organizationId, entity, entityId: id, action, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role, reason });
  }
  private period(start: string, end: string) {
    const from = calendarDate(start), to = calendarDate(end);
    const days = Math.round((to.getTime() - from.getTime()) / 86400000);
    if (days < 0 || days > 30) throw new BadRequestException('Timesheet period must be 1 to 31 days inclusive');
    return { from, to, days };
  }
  private async unlocked(organizationId: string, from: Date, to: Date) {
    const lock = await this.prisma.payrollPeriodLock.findFirst({ where: { organizationId, periodStart: { lte: to }, periodEnd: { gte: from } } });
    if (lock) throw new ConflictException('Payroll period is locked');
    const payroll = await this.prisma.payrollBatch.findFirst({ where: { organizationId, payPeriodStart: { lte: to }, payPeriodEnd: { gte: from }, status: { in: [PayrollBatchStatus.LOCKED, PayrollBatchStatus.PAYMENT_PROCESSING, PayrollBatchStatus.PAID] } }, select: { id: true } });
    if (payroll) throw new ConflictException('A locked or paid payroll batch covers these dates');
  }
  private async requireSheet(organizationId: string, id: string) {
    const sheet = await this.prisma.timesheet.findFirst({ where: { id, organizationId }, include: { entries: { include: { overtimeApproval: true } } } });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    return sheet;
  }
  private async editable(organizationId: string, id: string) {
    const sheet = await this.requireSheet(organizationId, id);
    if (sheet.status !== TimesheetStatus.DRAFT && sheet.status !== TimesheetStatus.REJECTED) throw new ConflictException('Timesheet must be draft or rejected to change entries');
    await this.unlocked(organizationId, sheet.periodStart, sheet.periodEnd);
    return sheet;
  }
  private inside(workDate: Date, sheet: { periodStart: Date; periodEnd: Date }) {
    if (workDate < sheet.periodStart || workDate > sheet.periodEnd) throw new BadRequestException('Entry date falls outside timesheet period');
  }
  private hours(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0 || value > 24) throw new BadRequestException(`${label} must be between 0 and 24`);
    return value;
  }
  async create(user: TenantJwtUser, dto: CreateTimesheetDto) {
    const { from, to } = this.period(dto.periodStart, dto.periodEnd);
    await this.unlocked(user.organizationId, from, to);
    if (!(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId } }))) throw new NotFoundException('Employee not found');
    try {
      const sheet = await this.prisma.timesheet.create({ data: { organizationId: user.organizationId, employeeId: dto.employeeId, periodStart: from, periodEnd: to } });
      await this.log(user, 'Timesheet', sheet.id, 'TIMESHEET_CREATED');
      return sheet;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Timesheet for this employee and period already exists'); throw error; }
  }
  async listAll(organizationId: string) { return this.prisma.timesheet.findMany({ where: { organizationId }, orderBy: { periodStart: 'desc' }, include: { entries: true }, take: 200 }); }
  async listByEmployee(organizationId: string, employeeId: string) {
    if (!(await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } }))) throw new NotFoundException('Employee not found');
    return this.prisma.timesheet.findMany({ where: { organizationId, employeeId }, orderBy: { periodStart: 'desc' }, include: { entries: true }, take: 100 });
  }
  async findOne(organizationId: string, id: string) { return this.requireSheet(organizationId, id); }
  async recalculateTotals(id: string) {
    const entries = await this.prisma.timesheetEntry.findMany({ where: { timesheetId: id } });
    return this.prisma.timesheet.update({ where: { id }, data: {
      totalHours: entries.reduce((sum, e) => sum + e.hoursWorked + e.overtimeHours, 0),
      regularHours: entries.reduce((sum, e) => sum + e.hoursWorked, 0),
      overtimeHours: entries.reduce((sum, e) => sum + e.overtimeHours, 0),
      scheduledHours: entries.reduce((sum, e) => sum + e.scheduledHours, 0),
      breakHours: entries.reduce((sum, e) => sum + e.breakHours, 0),
      totalDays: new Set(entries.map(e => e.workDate.toISOString().slice(0,10))).size,
    } });
  }
  async addEntry(user: TenantJwtUser, dto: CreateTimesheetEntryDto, reason: string) {
    const sheet = await this.editable(user.organizationId, dto.timesheetId);
    const day = calendarDate(dto.workDate); this.inside(day, sheet);
    this.hours(dto.hoursWorked, 'Worked hours'); this.hours(dto.overtimeHours ?? 0, 'Overtime hours');
    if (dto.hoursWorked + (dto.overtimeHours ?? 0) > 24) throw new BadRequestException('Daily hours exceed 24');
    const policy = await this.policy(user.organizationId);
    if (Math.round((dto.overtimeHours ?? 0) * 60) > (policy?.maxDailyOvertimeMinutes ?? 360)) throw new BadRequestException('Overtime exceeds daily policy cap');
    const why = reason?.trim(); if (!why) throw new BadRequestException('Reason is required for manual entries');
    try {
      const entry = await this.prisma.timesheetEntry.create({ data: { timesheetId: sheet.id, workDate: day, hoursWorked: dto.hoursWorked, overtimeHours: dto.overtimeHours ?? 0, description: dto.description, projectCode: dto.projectCode, taskCode: dto.taskCode } });
      await this.prisma.timesheetAdjustment.create({ data: { timesheetId: sheet.id, entryId: entry.id, after: JSON.parse(JSON.stringify(entry)), reason: why, actorUserId: user.sub } });
      if (entry.overtimeHours > 0) await this.requestOvertimeForEntry(user, sheet, entry.id, entry.overtimeHours);
      await this.recalculateTotals(sheet.id);
      await this.log(user, 'TimesheetEntry', entry.id, 'TIMESHEET_ENTRY_ADDED', why);
      return entry;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('An entry for this day already exists'); throw error; }
  }
  async updateEntry(user: TenantJwtUser, entryId: string, dto: UpdateTimesheetEntryDto, reason: string) {
    const entry = await this.prisma.timesheetEntry.findFirst({ where: { id: entryId, timesheet: { organizationId: user.organizationId } } });
    if (!entry) throw new NotFoundException('Timesheet entry not found');
    const sheet = await this.editable(user.organizationId, entry.timesheetId);
    const why = reason?.trim(); if (!why) throw new BadRequestException('Reason is required for adjustments');
    const day = dto.workDate ? calendarDate(dto.workDate) : entry.workDate; this.inside(day, sheet);
    const regular = this.hours(dto.hoursWorked ?? entry.hoursWorked, 'Worked hours');
    const overtime = this.hours(dto.overtimeHours ?? entry.overtimeHours, 'Overtime hours');
    if (regular + overtime > 24) throw new BadRequestException('Daily hours exceed 24');
    const policy = await this.policy(user.organizationId);
    if (Math.round(overtime * 60) > (policy?.maxDailyOvertimeMinutes ?? 360)) throw new BadRequestException('Overtime exceeds daily policy cap');
    const updated = await this.prisma.$transaction(async tx => {
      const changed = await tx.timesheetEntry.update({ where: { id: entry.id }, data: { workDate: day, hoursWorked: regular, overtimeHours: overtime, description: dto.description, projectCode: dto.projectCode, taskCode: dto.taskCode, generated: false } });
      await tx.timesheetAdjustment.create({ data: { timesheetId: sheet.id, entryId: entry.id, before: JSON.parse(JSON.stringify(entry)), after: JSON.parse(JSON.stringify(changed)), reason: why, actorUserId: user.sub } });
      await tx.overtimeApproval.deleteMany({ where: { entryId: entry.id, status: OvertimeApprovalStatus.PENDING } });
      return changed;
    });
    if (overtime > 0) await this.requestOvertimeForEntry(user, sheet, entry.id, overtime);
    await this.recalculateTotals(sheet.id); await this.log(user, 'TimesheetEntry', entry.id, 'TIMESHEET_ENTRY_ADJUSTED', why);
    return updated;
  }
  async deleteEntry(user: TenantJwtUser, entryId: string, reason: string) {
    const entry = await this.prisma.timesheetEntry.findFirst({ where: { id: entryId, timesheet: { organizationId: user.organizationId } } });
    if (!entry) throw new NotFoundException('Timesheet entry not found');
    const sheet = await this.editable(user.organizationId, entry.timesheetId);
    const why = reason?.trim(); if (!why) throw new BadRequestException('Reason is required');
    await this.prisma.$transaction(async tx => {
      await tx.timesheetAdjustment.create({ data: { timesheetId: sheet.id, entryId: entry.id, before: JSON.parse(JSON.stringify(entry)), after: { deleted: true }, reason: why, actorUserId: user.sub } });
      await tx.timesheetEntry.delete({ where: { id: entry.id } });
    });
    await this.recalculateTotals(sheet.id); await this.log(user, 'TimesheetEntry', entry.id, 'TIMESHEET_ENTRY_DELETED', why);
    return { deleted: true };
  }
  private async requestOvertimeForEntry(user: TenantJwtUser, sheet: { id: string; employeeId: string }, entryId: string, hours: number) {
    const policy = await this.prisma.overtimePolicy.findUnique({ where: { organizationId: user.organizationId } });
    const minutes = Math.round(hours * 60);
    if (minutes > (policy?.maxDailyOvertimeMinutes ?? 360)) throw new BadRequestException('Overtime exceeds daily policy cap');
    await this.prisma.overtimeApproval.upsert({ where: { entryId }, create: { organizationId: user.organizationId, employeeId: sheet.employeeId, timesheetId: sheet.id, entryId, requestedMinutes: minutes, ...(policy?.requireApproval === false ? { status: OvertimeApprovalStatus.APPROVED, approvedMinutes: minutes, reviewedAt: new Date(), reason: 'Automatic approval under company policy' } : {}) }, update: { requestedMinutes: minutes, approvedMinutes: policy?.requireApproval === false ? minutes : null, status: policy?.requireApproval === false ? OvertimeApprovalStatus.APPROVED : OvertimeApprovalStatus.PENDING, reviewedAt: policy?.requireApproval === false ? new Date() : null, reviewedByUserId: null } });
  }
  async policy(organizationId: string) { return this.prisma.overtimePolicy.findUnique({ where: { organizationId } }); }
  async setPolicy(user: TenantJwtUser, threshold: number, cap: number, requireApproval: boolean) {
    if (![threshold, cap].every(Number.isInteger) || threshold < 1 || threshold > 1440 || cap < 0 || cap > 1440) throw new BadRequestException('Invalid daily overtime policy');
    const policy = await this.prisma.overtimePolicy.upsert({ where: { organizationId: user.organizationId }, create: { organizationId: user.organizationId, dailyThresholdMinutes: threshold, maxDailyOvertimeMinutes: cap, requireApproval }, update: { dailyThresholdMinutes: threshold, maxDailyOvertimeMinutes: cap, requireApproval } });
    await this.log(user, 'OvertimePolicy', policy.id, 'OVERTIME_POLICY_UPDATED'); return policy;
  }
  async generate(user: TenantJwtUser, employeeId: string, start: string, end: string) {
    const { from, to, days } = this.period(start, end);
    if (to.getTime() > Date.now()) throw new BadRequestException('Cannot generate future timesheets');
    await this.unlocked(user.organizationId, from, to);
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId: user.organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const policy = await this.policy(user.organizationId);
    const organization = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { timezone: true } });
    const existing = await this.prisma.timesheet.findFirst({ where: { organizationId: user.organizationId, employeeId, periodStart: from, periodEnd: to } });
    if (existing && existing.status !== TimesheetStatus.DRAFT) throw new ConflictException('Only a draft timesheet may be regenerated');
    if (existing && await this.prisma.timesheetAdjustment.count({ where: { timesheetId: existing.id } })) throw new ConflictException('Timesheet with manual adjustments cannot be regenerated');
    const rows: Array<{ workDate: Date; hoursWorked: number; overtimeHours: number; scheduledHours: number; breakHours: number; sourceAttendanceRecordId?: string; sourceAttendanceEventIds: string[]; generated: boolean }> = [];
    for (let i = 0; i <= days; i++) {
      const day = new Date(from.getTime() + i * 86400000), date = day.toISOString().slice(0,10);
      const { schedule } = await this.schedules.effective(user.organizationId, employeeId, date);
      const zone = schedule?.workLocation?.timezone ?? organization?.timezone ?? 'Africa/Johannesburg';
      const begin = localInstant(date, 0, zone), next = localInstant(new Date(day.getTime()+86400000).toISOString().slice(0,10), 0, zone);
      const plannedMinutes = schedule ? (schedule.shift.endMinute - schedule.shift.startMinute + 1440) % 1440 - schedule.shift.unpaidBreakMinutes : 0;
      const scheduledHours = Math.max(0, plannedMinutes) / 60;
      const record = await this.prisma.attendanceRecord.findFirst({ where: { organizationId: user.organizationId, employeeId, clockIn: { gte: begin, lt: next }, clockOut: { not: null } }, orderBy: { clockIn: 'asc' } });
      const windowEnd = schedule && schedule.shift.endMinute < schedule.shift.startMinute ? new Date(next.getTime()+12*3600000) : next;
      const events = await this.prisma.attendanceEvent.findMany({ where: { organizationId: user.organizationId, employeeId, capturedAt: { gte: begin, lt: windowEnd } }, include: { attendanceCorrection: true }, orderBy: { capturedAt: 'asc' } });
      const effective = events.map(e => ({ id: e.id, type: e.attendanceCorrection?.correctedEventType ?? e.eventType, at: e.attendanceCorrection?.correctedCapturedAt ?? e.capturedAt })).filter(e => e.at >= begin && e.at < windowEnd);
      const checkIn = effective.find(e => e.type === 'CHECK_IN');
      const checkOut = [...effective].reverse().find(e => e.type === 'CHECK_OUT' && (!checkIn || e.at > checkIn.at));
      const clockIn = checkIn?.at ?? record?.clockIn;
      const clockOut = checkIn && checkOut ? checkOut.at : !checkIn ? record?.clockOut : null;
      if (!clockIn || !clockOut || clockOut <= clockIn) continue;
      const elapsed = Math.round((clockOut.getTime()-clockIn.getTime())/60000);
      if (elapsed > 24*60) throw new BadRequestException(`Attendance exceeds 24 hours on ${date}; correct it before generation`);
      const calculated = calculateDailyHours(elapsed, schedule?.shift.unpaidBreakMinutes ?? 0, Math.max(0, plannedMinutes), policy?.dailyThresholdMinutes ?? 480, policy?.maxDailyOvertimeMinutes ?? 360);
      rows.push({ workDate: day, hoursWorked: calculated.regularHours, overtimeHours: calculated.overtimeHours, scheduledHours: calculated.scheduledHours, breakHours: calculated.breakHours, sourceAttendanceRecordId: checkIn ? undefined : record?.id, sourceAttendanceEventIds: checkIn && checkOut ? [checkIn.id,checkOut.id] : [], generated: true });
    }
    const sheet = await this.prisma.$transaction(async tx => {
      const current = existing ?? await tx.timesheet.create({ data: { organizationId: user.organizationId, employeeId, periodStart: from, periodEnd: to } });
      await tx.timesheetEntry.deleteMany({ where: { timesheetId: current.id } });
      for (const row of rows) {
        const entry = await tx.timesheetEntry.create({ data: { timesheetId: current.id, ...row } });
        if (row.overtimeHours > 0) await tx.overtimeApproval.create({ data: { organizationId: user.organizationId, employeeId, timesheetId: current.id, entryId: entry.id, requestedMinutes: Math.round(row.overtimeHours*60), ...(policy?.requireApproval === false ? { status: OvertimeApprovalStatus.APPROVED, approvedMinutes: Math.round(row.overtimeHours*60), reviewedAt: new Date(), reason: 'Automatic approval under company policy' } : {}) } });
      }
      return current;
    });
    await this.recalculateTotals(sheet.id); await this.log(user, 'Timesheet', sheet.id, 'TIMESHEET_GENERATED');
    return this.findOne(user.organizationId, sheet.id);
  }
  async overtimeQueue(organizationId: string, status?: OvertimeApprovalStatus) { return this.prisma.overtimeApproval.findMany({ where: { organizationId, ...(status ? { status } : {}) }, include: { entry: true }, orderBy: { createdAt: 'desc' }, take: 200 }); }
  async reviewOvertime(user: TenantJwtUser, id: string, status: OvertimeApprovalStatus, minutes: number | undefined, reason: string) {
    if (status === OvertimeApprovalStatus.PENDING) throw new BadRequestException('Select APPROVED or REJECTED');
    const approval = await this.prisma.overtimeApproval.findFirst({ where: { id, organizationId: user.organizationId }, include: { timesheet: true } });
    if (!approval) throw new NotFoundException('Overtime request not found');
    await this.editable(user.organizationId, approval.timesheetId);
    if (status === OvertimeApprovalStatus.APPROVED && (!Number.isInteger(minutes) || minutes! < 0 || minutes! > approval.requestedMinutes)) throw new BadRequestException('Approved minutes must be within the request');
    const changed = await this.prisma.overtimeApproval.updateMany({ where: { id, organizationId: user.organizationId, status: OvertimeApprovalStatus.PENDING }, data: { status, approvedMinutes: status === OvertimeApprovalStatus.APPROVED ? minutes : 0, reason: reason?.trim(), reviewedAt: new Date(), reviewedByUserId: user.sub } });
    if (!changed.count) throw new ConflictException('Overtime was already reviewed');
    await this.log(user, 'OvertimeApproval', id, 'OVERTIME_REVIEWED', reason);
    return this.prisma.overtimeApproval.findUnique({ where: { id } });
  }
  async status(user: TenantJwtUser, id: string, next: TimesheetStatus) {
    const sheet = await this.requireSheet(user.organizationId, id);
    await this.unlocked(user.organizationId, sheet.periodStart, sheet.periodEnd);
    const allowed: Record<string, TimesheetStatus[]> = { DRAFT: [TimesheetStatus.SUBMITTED], REJECTED: [TimesheetStatus.DRAFT,TimesheetStatus.SUBMITTED], SUBMITTED: [TimesheetStatus.APPROVED,TimesheetStatus.REJECTED] };
    if (!allowed[sheet.status]?.includes(next)) throw new ConflictException('Invalid timesheet status transition');
    if (next === TimesheetStatus.APPROVED) {
      const pending = sheet.entries.some(entry => entry.overtimeHours > 0 && entry.overtimeApproval?.status === OvertimeApprovalStatus.PENDING);
      if (pending) throw new ConflictException('Review all overtime before approving timesheet');
      const missing = sheet.entries.some(entry => entry.overtimeHours > 0 && !entry.overtimeApproval);
      if (missing) throw new ConflictException('Overtime approval missing for an entry');
    }
    const changed = await this.prisma.timesheet.updateMany({ where: { id, organizationId: user.organizationId, status: sheet.status }, data: { status: next, ...(next === TimesheetStatus.SUBMITTED ? { submittedAt: new Date() } : {}), ...(next === TimesheetStatus.APPROVED ? { approvedAt: new Date(), approvedByUserId: user.sub, reviewedAt: new Date(), reviewedByUserId: user.sub } : {}), ...(next === TimesheetStatus.REJECTED ? { rejectedAt: new Date(), reviewedAt: new Date(), reviewedByUserId: user.sub } : {}) } });
    if (!changed.count) throw new ConflictException('Timesheet status changed concurrently');
    await this.log(user, 'Timesheet', id, `TIMESHEET_${next}`); return this.findOne(user.organizationId, id);
  }
  async lockPeriod(user: TenantJwtUser, start: string, end: string) {
    const { from, to } = this.period(start, end);
    await this.unlocked(user.organizationId, from, to);
    const sheets = await this.prisma.timesheet.findMany({ where: { organizationId: user.organizationId, periodStart: { gte: from }, periodEnd: { lte: to } } });
    if (!sheets.length || sheets.some(sheet => sheet.status !== TimesheetStatus.APPROVED)) throw new ConflictException('All timesheets in period must be approved');
    const crossing = await this.prisma.timesheet.count({ where: { organizationId: user.organizationId, periodStart: { lte: to }, periodEnd: { gte: from }, OR: [{ periodStart: { lt: from } }, { periodEnd: { gt: to } }] } });
    if (crossing) throw new ConflictException('Timesheet crosses payroll period boundary');
    const lock = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), 600)`;
      const overlap = await tx.payrollPeriodLock.findFirst({ where: { organizationId: user.organizationId, periodStart: { lte: to }, periodEnd: { gte: from } } });
      if (overlap) throw new ConflictException('Payroll period already locked');
      const created = await tx.payrollPeriodLock.create({ data: { organizationId: user.organizationId, periodStart: from, periodEnd: to, lockedByUserId: user.sub } });
      await tx.timesheet.updateMany({ where: { id: { in: sheets.map(sheet => sheet.id) }, organizationId: user.organizationId, status: TimesheetStatus.APPROVED }, data: { status: TimesheetStatus.LOCKED, lockedAt: new Date(), lockId: created.id } });
      return created;
    });
    await this.log(user, 'PayrollPeriodLock', lock.id, 'TIMESHEET_PERIOD_LOCKED'); return lock;
  }
  async report(organizationId: string, start: string, end: string) {
    const { from, to } = this.period(start, end);
    const sheets = await this.prisma.timesheet.findMany({ where: { organizationId, periodStart: { gte: from }, periodEnd: { lte: to } }, select: { id: true, employeeId: true, status: true, regularHours: true, overtimeHours: true, scheduledHours: true, breakHours: true, totalHours: true, overtimeApprovals: { select: { status: true, approvedMinutes: true } } } });
    const approvedOvertimeHours = sheets.reduce((sum, sheet) => sum + sheet.overtimeApprovals.filter(item => item.status === OvertimeApprovalStatus.APPROVED).reduce((n,item) => n + (item.approvedMinutes ?? 0)/60, 0), 0);
    return { from, to, timesheets: sheets, totals: { approvedOvertimeHours, scheduledHours: sheets.reduce((s,x)=>s+x.scheduledHours,0), regularHours: sheets.reduce((s,x)=>s+x.regularHours,0), overtimeHours: sheets.reduce((s,x)=>s+x.overtimeHours,0), breakHours: sheets.reduce((s,x)=>s+x.breakHours,0), totalHours: sheets.reduce((s,x)=>s+x.totalHours,0) } };
  }
  async adjustments(organizationId: string, id: string) { await this.requireSheet(organizationId,id); return this.prisma.timesheetAdjustment.findMany({ where: { timesheetId: id }, orderBy: { createdAt: 'desc' } }); }
}
