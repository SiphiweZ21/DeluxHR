import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateRecurringScheduleDto, EndRecurringScheduleDto } from './dto/create-recurring-schedule.dto';

export function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Date must be YYYY-MM-DD');
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new BadRequestException('Invalid calendar date');
  return date;
}
@Injectable()
export class RecurringSchedulesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async create(user: TenantJwtUser, dto: CreateRecurringScheduleDto) {
    const organizationId = user.organizationId;
    if (Boolean(dto.employeeId) === Boolean(dto.departmentId)) throw new BadRequestException('Specify exactly one employeeId or departmentId');
    const from = calendarDate(dto.effectiveFrom), to = dto.effectiveTo ? calendarDate(dto.effectiveTo) : null;
    if (to && to <= from) throw new BadRequestException('End date must be after start date');
    if (!Array.isArray(dto.weekdays) || !dto.weekdays.length || new Set(dto.weekdays).size !== dto.weekdays.length || dto.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new BadRequestException('Weekdays must be unique ISO days 1 to 7');
    if (!(await this.prisma.shiftDefinition.findFirst({ where: { id: dto.shiftId, organizationId, isActive: true } }))) throw new NotFoundException('Active shift not found');
    if (dto.employeeId && !(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId } }))) throw new NotFoundException('Employee not found');
    if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId } }))) throw new NotFoundException('Department not found');
    if (dto.workLocationId && !(await this.prisma.workLocation.findFirst({ where: { id: dto.workLocationId, organizationId, isActive: true } }))) throw new NotFoundException('Active work location not found');
    const graceInMinutes = dto.graceInMinutes ?? 0, graceOutMinutes = dto.graceOutMinutes ?? 0;
    if (![graceInMinutes,graceOutMinutes].every(v => Number.isInteger(v) && v >= 0 && v <= 240)) throw new BadRequestException('Grace must be between 0 and 240 minutes');
    const schedule = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${dto.employeeId ?? `department:${dto.departmentId}`}))`;
      const conflicts = await tx.recurringSchedule.findMany({ where: { organizationId, isActive: true, ...(dto.employeeId ? { employeeId: dto.employeeId } : { departmentId: dto.departmentId }), effectiveFrom: { lt: to ?? new Date('9999-12-31') }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] }, select: { weekdays: true } });
      if (conflicts.some(c => c.weekdays.some(day => dto.weekdays.includes(day)))) throw new ConflictException('Overlapping recurring schedule for this target and weekday');
      return tx.recurringSchedule.create({ data: { organizationId, shiftId: dto.shiftId, employeeId: dto.employeeId, departmentId: dto.departmentId, workLocationId: dto.workLocationId, weekdays: dto.weekdays, effectiveFrom: from, effectiveTo: to, graceInMinutes, graceOutMinutes, createdByUserId: user.sub }, include: { shift: true, workLocation: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.log({ organizationId, action: 'RECURRING_SCHEDULE_CREATED', entity: 'RecurringSchedule', entityId: schedule.id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role });
    return schedule;
  }
  async list(organizationId: string, employeeId?: string, departmentId?: string) {
    if (employeeId && departmentId) throw new BadRequestException('Filter by one target');
    return this.prisma.recurringSchedule.findMany({ where: { organizationId, ...(employeeId ? { employeeId } : {}), ...(departmentId ? { departmentId } : {}) }, include: { shift: true, workLocation: true }, orderBy: { effectiveFrom: 'desc' }, take: 200 });
  }
  async effective(organizationId: string, employeeId: string, dateString: string) {
    const date = calendarDate(dateString);
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: { departmentId: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    const weekday = date.getUTCDay() || 7;
    const where = { organizationId, isActive: true, weekdays: { has: weekday }, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] };
    const employeeSchedule = await this.prisma.recurringSchedule.findFirst({ where: { ...where, employeeId }, include: { shift: true, workLocation: true } });
    if (employeeSchedule) return { source: 'EMPLOYEE', schedule: employeeSchedule };
    const departmentSchedule = await this.prisma.recurringSchedule.findFirst({ where: { ...where, departmentId: employee.departmentId }, include: { shift: true, workLocation: true } });
    return { source: departmentSchedule ? 'DEPARTMENT' : null, schedule: departmentSchedule };
  }
  async end(user: TenantJwtUser, id: string, dto: EndRecurringScheduleDto) {
    const to = calendarDate(dto.effectiveTo);
    const schedule = await this.prisma.recurringSchedule.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!schedule) throw new NotFoundException('Recurring schedule not found');
    if (to <= schedule.effectiveFrom || (schedule.effectiveTo && to > schedule.effectiveTo)) throw new BadRequestException('End date must fall within the schedule interval');
    const updated = await this.prisma.recurringSchedule.update({ where: { id: schedule.id }, data: { effectiveTo: to } });
    await this.audit.log({ organizationId: user.organizationId, action: 'RECURRING_SCHEDULE_ENDED', entity: 'RecurringSchedule', entityId: id, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role });
    return updated;
  }
}
