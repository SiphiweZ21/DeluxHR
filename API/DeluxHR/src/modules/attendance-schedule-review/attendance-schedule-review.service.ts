import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceEventType, AttendanceExceptionStatus, AttendanceExceptionType, EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecurringSchedulesService, calendarDate } from '../recurring-schedules/recurring-schedules.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { ScanSchedulesDto } from './dto/scan-schedules.dto';
import { ExplainExceptionDto } from './dto/explain-exception.dto';

// Convert a local wall-clock date/time in an IANA zone into an instant, including DST changes.
export function localInstant(date: string, minute: number, zone: string): Date {
  const desired = Date.parse(date + 'T00:00:00Z') + minute * 60000;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let instant = desired;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const next = instant + desired - local;
    if (next === instant) return new Date(instant);
    instant = next;
  }
  throw new BadRequestException('Scheduled local time is ambiguous or invalid in the configured time zone');
}
@Injectable()
export class AttendanceScheduleReviewService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly schedules: RecurringSchedulesService) {}
  async scan(user: TenantJwtUser, dto: ScanSchedulesDto) {
    const from = calendarDate(dto.from), to = calendarDate(dto.to);
    const days = Math.round((to.getTime() - from.getTime()) / 86400000);
    if (days < 0 || days > 30) throw new BadRequestException('Scan must cover 1 to 31 calendar days');
    if (to.getTime() > Date.now()) throw new BadRequestException('Cannot scan future dates');
    const organization = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { timezone: true } });
    const employees = await this.prisma.employee.findMany({ where: { organizationId: user.organizationId, status: EmployeeStatus.ACTIVE, ...(dto.employeeId ? { id: dto.employeeId } : {}) }, select: { id: true, departmentId: true, employmentStartDate: true, employmentEndDate: true }, take: 501 });
    if (employees.length > 500) throw new BadRequestException('Scan up to 500 employees at a time; specify employeeId for a larger company');
    let scanned = 0, onLeave = 0, created = 0, alreadyDetected = 0, pending = 0;
    for (let offset = 0; offset <= days; offset++) {
      const day = new Date(from.getTime() + offset * 86400000);
      const date = day.toISOString().slice(0, 10);
      for (const employee of employees) {
        if (employee.employmentStartDate && employee.employmentStartDate > day || employee.employmentEndDate && employee.employmentEndDate < day) continue;
        const { schedule } = await this.schedules.effective(user.organizationId, employee.id, date);
        if (!schedule) continue;
        scanned++;
        const zone = schedule.workLocation?.timezone ?? organization?.timezone ?? 'Africa/Johannesburg';
        let start: Date, end: Date;
        try {
          start = localInstant(date, schedule.shift.startMinute, zone);
          const endDay = schedule.shift.endMinute < schedule.shift.startMinute ? new Date(day.getTime() + 86400000).toISOString().slice(0,10) : date;
          end = localInstant(endDay, schedule.shift.endMinute, zone);
        } catch (error) { if (error instanceof RangeError) throw new BadRequestException('Invalid organization or work location time zone'); throw error; }
        // A shift is evaluated only after its end plus the configured checkout grace.
        if (end.getTime() + schedule.graceOutMinutes * 60000 > Date.now()) { pending++; continue; }
        const leave = await this.prisma.leaveRequest.findFirst({ where: { organizationId: user.organizationId, employeeId: employee.id, status: 'APPROVED', startDate: { lte: end }, endDate: { gte: start } }, select: { id: true } });
        if (leave) { onLeave++; continue; }
        // Permit check-in up to four hours early and checkout up to eight hours late.
        const windowStart = new Date(start.getTime() - 4 * 3600000), windowEnd = new Date(end.getTime() + 8 * 3600000);
        const events = await this.prisma.attendanceEvent.findMany({ where: { organizationId: user.organizationId, employeeId: employee.id, capturedAt: { gte: windowStart, lte: windowEnd } }, include: { attendanceCorrection: true }, orderBy: { capturedAt: 'asc' } });
        const effective = events.map(event => ({ id: event.id, type: event.attendanceCorrection?.correctedEventType ?? event.eventType, at: event.attendanceCorrection?.correctedCapturedAt ?? event.capturedAt, location: event.attendanceCorrection?.correctedWorkLocationId ?? event.workLocationId })).filter(event => event.at >= windowStart && event.at <= windowEnd);
        const checkIns = effective.filter(event => event.type === AttendanceEventType.CHECK_IN).sort((a,b) => a.at.getTime()-b.at.getTime());
        const checkOuts = effective.filter(event => event.type === AttendanceEventType.CHECK_OUT).sort((a,b) => b.at.getTime()-a.at.getTime());
        const first = checkIns[0], last = checkOuts[0];
        const findings: Array<{ type: AttendanceExceptionType; eventId?: string; expectedBy: Date; note: string }> = [];
        if (!first && !last) findings.push({ type: AttendanceExceptionType.EXPECTED_ABSENCE, expectedBy: start, note: 'No attendance was captured for a completed scheduled shift. Review before determining absence or pay.' });
        else {
          if (!first) findings.push({ type: AttendanceExceptionType.MISSING_CHECK_IN, eventId: last?.id, expectedBy: start, note: 'Check-out exists without a check-in for the scheduled shift.' });
          if (!last) findings.push({ type: AttendanceExceptionType.MISSING_CHECK_OUT, eventId: first?.id, expectedBy: end, note: 'Check-in exists without a check-out for the scheduled shift.' });
          if (first && first.at.getTime() > start.getTime() + schedule.graceInMinutes * 60000) findings.push({ type: AttendanceExceptionType.LATE_ARRIVAL, eventId: first.id, expectedBy: new Date(start.getTime() + schedule.graceInMinutes * 60000), note: 'Check-in occurred after scheduled start and grace period.' });
          if (last && last.at.getTime() < end.getTime() - schedule.graceOutMinutes * 60000) findings.push({ type: AttendanceExceptionType.EARLY_DEPARTURE, eventId: last.id, expectedBy: new Date(end.getTime() - schedule.graceOutMinutes * 60000), note: 'Check-out occurred before scheduled end less grace period.' });
          if (schedule.workLocationId && [first,last].some(event => event && event.location !== schedule.workLocationId)) findings.push({ type: AttendanceExceptionType.LOCATION_MISMATCH, eventId: first?.id ?? last?.id, expectedBy: start, note: 'Attendance location differs from the scheduled work location.' });
        }
        for (const finding of findings) {
          try {
            const exception = await this.prisma.attendanceException.create({ data: { organizationId: user.organizationId, employeeId: employee.id, workLocationId: schedule.workLocationId, type: finding.type, scheduledDate: day, expectedBy: finding.expectedBy, note: finding.note, sourceAttendanceEventId: finding.eventId, status: AttendanceExceptionStatus.OPEN } });
            created++;
            await this.audit.log({ organizationId: user.organizationId, action: 'SCHEDULE_ATTENDANCE_EXCEPTION_DETECTED', entity: 'AttendanceException', entityId: exception.id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role, metadata: { employeeId: employee.id, date, type: finding.type, payrollEffect: 'NONE' } });
          } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') alreadyDetected++; else throw error; }
        }
      }
    }
    return { scanned, onLeave, pending, created, alreadyDetected, notice: 'Exceptions require human review and have no automatic payroll effect.' };
  }
  async explain(user: TenantJwtUser, id: string, dto: ExplainExceptionDto) {
    const exception = await this.prisma.attendanceException.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!exception) throw new NotFoundException('Attendance exception not found');
    const employee = await this.prisma.employee.findFirst({ where: { organizationId: user.organizationId, userId: user.sub, id: exception.employeeId }, select: { id: true } });
    if (!employee) throw new ForbiddenException('Only the affected employee can explain this exception');
    const explanation = dto.explanation?.trim();
    if (!explanation || explanation.length < 5 || explanation.length > 2000) throw new BadRequestException('Explanation must be 5 to 2000 characters');
    const changed = await this.prisma.attendanceException.updateMany({ where: { id, organizationId: user.organizationId, status: AttendanceExceptionStatus.OPEN, employeeExplanation: null }, data: { employeeExplanation: explanation, explainedAt: new Date(), explainedByUserId: user.sub } });
    if (!changed.count) throw new ConflictException('Exception is already reviewed or explained');
    await this.audit.log({ organizationId: user.organizationId, action: 'ATTENDANCE_EXCEPTION_EXPLAINED', entity: 'AttendanceException', entityId: id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role });
    return this.prisma.attendanceException.findUnique({ where: { id } });
  }
}
