import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveAccrualMode, LeaveBalanceAdjustmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { TenantJwtUser } from '../../../common/auth/jwt-user.type';
import { calendarDate } from '../../recurring-schedules/recurring-schedules.service';
import { AdjustLeaveBalanceDto, AssignLeavePolicyDto, CreateLeavePolicyDto, CreatePublicHolidayDto } from './dto/leave-policy.dto';

type Policy = { id: string; organizationId: string; leaveTypeId: string; annualEntitlementDays: number; accrualMode: LeaveAccrualMode; carryOverMaxDays: number; carryOverExpiryMonths: number; maxNegativeDays: number; probationMonths: number; workingWeekdays: number[]; excludePublicHolidays: boolean; isActive: boolean; createdAt: Date; supportingDocumentRequired: boolean; medicalCertificateAfterDays: number | null };
export function countWorkingDays(from: Date, to: Date, weekdays: number[], holidays: Set<string>): number {
  if (to < from) throw new BadRequestException('End date precedes start date');
  const days = Math.round((to.getTime()-from.getTime())/86400000);
  if (days > 366) throw new BadRequestException('Leave span exceeds 366 days');
  let count = 0;
  for (let i = 0; i <= days; i++) {
    const date = new Date(from.getTime()+i*86400000);
    if (weekdays.includes(date.getUTCDay() || 7) && !holidays.has(date.toISOString().slice(0,10))) count++;
  }
  return count;
}
export function accrualForYear(mode: LeaveAccrualMode, annual: number, employmentStart: Date | null, asOf: Date): number {
  const year = asOf.getUTCFullYear(), first = new Date(Date.UTC(year,0,1)), last = new Date(Date.UTC(year,11,31));
  const joined = employmentStart && employmentStart > first ? employmentStart : first;
  if (joined > asOf) return 0;
  if (mode === LeaveAccrualMode.MONTHLY) {
    const startMonth = joined.getUTCFullYear() === year ? joined.getUTCMonth() : 0;
    return Math.min(annual, annual * (asOf.getUTCMonth()-startMonth+1)/12);
  }
  return annual * (last.getTime()-joined.getTime()+86400000)/(last.getTime()-first.getTime()+86400000);
}
@Injectable()
export class LeavePolicyService {
 constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
 private async log(user: TenantJwtUser, entity: string, entityId: string, action: string, reason?: string) {
   await this.audit.log({ organizationId: user.organizationId, entity, entityId, action, actorUserId: user.sub, actorEmail: user.email, actorRole: user.role, reason });
 }
 private validPolicy(dto: CreateLeavePolicyDto) {
   if (!Array.isArray(dto.workingWeekdays) || dto.workingWeekdays.length < 1 || new Set(dto.workingWeekdays).size !== dto.workingWeekdays.length || dto.workingWeekdays.some(v => !Number.isInteger(v) || v < 1 || v > 7)) throw new BadRequestException('Working weekdays must be unique ISO days 1 to 7');
   for (const n of [dto.annualEntitlementDays,dto.carryOverMaxDays,dto.maxNegativeDays]) if (!Number.isFinite(n) || n < 0 || n > 365) throw new BadRequestException('Invalid leave entitlement');
   if (dto.medicalCertificateAfterDays !== undefined && (!Number.isInteger(dto.medicalCertificateAfterDays) || dto.medicalCertificateAfterDays < 1 || dto.medicalCertificateAfterDays > 366)) throw new BadRequestException('Invalid medical certificate threshold');
   if (!Number.isInteger(dto.carryOverExpiryMonths) || dto.carryOverExpiryMonths < 0 || dto.carryOverExpiryMonths > 12 || !Number.isInteger(dto.probationMonths) || dto.probationMonths < 0 || dto.probationMonths > 120) throw new BadRequestException('Invalid leave policy months');
 }
 async create(user: TenantJwtUser, dto: CreateLeavePolicyDto) {
   this.validPolicy(dto);
   if (!(await this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId, organizationId: user.organizationId } }))) throw new NotFoundException('Leave type not found');
   const code = dto.code?.trim().toUpperCase(), name = dto.name?.trim();
   if (!code || !/^[A-Z0-9_-]{1,40}$/.test(code) || !name) throw new BadRequestException('Valid policy code and name required');
   const policy = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${dto.leaveTypeId}))`;
     if (dto.isDefault && await tx.leavePolicy.findFirst({ where: { organizationId: user.organizationId, leaveTypeId: dto.leaveTypeId, isDefault: true, isActive: true } })) throw new ConflictException('Active default policy already exists for this leave type');
     return tx.leavePolicy.create({ data: { ...dto, organizationId: user.organizationId, code, name } });
   });
   await this.log(user,'LeavePolicy',policy.id,'LEAVE_POLICY_CREATED'); return policy;
 }
 async list(organizationId: string) { return this.prisma.leavePolicy.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }); }
 async setActive(user: TenantJwtUser, id: string, active: boolean) {
   const policy = await this.prisma.leavePolicy.findFirst({ where: { id, organizationId: user.organizationId } });
   if (!policy) throw new NotFoundException('Leave policy not found');
   if (!active && await this.prisma.employeeLeavePolicyAssignment.findFirst({ where: { organizationId: user.organizationId, policyId: id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } })) throw new ConflictException('End current employee assignments before deactivating policy');
   const changed = await this.prisma.leavePolicy.update({ where: { id }, data: { isActive: active } });
   await this.log(user,'LeavePolicy',id, active ? 'LEAVE_POLICY_ACTIVATED' : 'LEAVE_POLICY_DEACTIVATED'); return changed;
 }
 async assign(user: TenantJwtUser, dto: AssignLeavePolicyDto) {
   const from = calendarDate(dto.effectiveFrom), to = dto.effectiveTo ? calendarDate(dto.effectiveTo) : null;
   if (to && to <= from) throw new BadRequestException('End date must follow start date');
   const policy = await this.prisma.leavePolicy.findFirst({ where: { id: dto.policyId, organizationId: user.organizationId, isActive: true } });
   if (!policy) throw new NotFoundException('Active leave policy not found');
   if (!(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId } }))) throw new NotFoundException('Employee not found');
   const assignment = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${dto.employeeId + ':' + policy.leaveTypeId}))`;
     const overlap = await tx.employeeLeavePolicyAssignment.findFirst({ where: { organizationId: user.organizationId, employeeId: dto.employeeId, leaveTypeId: policy.leaveTypeId, effectiveFrom: { lt: to ?? new Date('9999-12-31') }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] } });
     if (overlap) throw new ConflictException('Employee leave policy assignment overlaps another interval');
     return tx.employeeLeavePolicyAssignment.create({ data: { organizationId: user.organizationId, employeeId: dto.employeeId, leaveTypeId: policy.leaveTypeId, policyId: policy.id, effectiveFrom: from, effectiveTo: to, assignedByUserId: user.sub } });
   });
   await this.log(user,'EmployeeLeavePolicyAssignment',assignment.id,'EMPLOYEE_LEAVE_POLICY_ASSIGNED'); return assignment;
 }
 async assignments(organizationId: string, employeeId: string) {
   if (!(await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } }))) throw new NotFoundException('Employee not found');
   return this.prisma.employeeLeavePolicyAssignment.findMany({ where: { organizationId, employeeId }, include: { policy: true }, orderBy: { effectiveFrom: 'desc' } });
 }
 async endAssignment(user: TenantJwtUser, id: string, dateString: string) {
   const to = calendarDate(dateString);
   const assignment = await this.prisma.employeeLeavePolicyAssignment.findFirst({ where: { id, organizationId: user.organizationId } });
   if (!assignment) throw new NotFoundException('Leave policy assignment not found');
   if (to <= assignment.effectiveFrom || (assignment.effectiveTo && to > assignment.effectiveTo)) throw new BadRequestException('End date must fall within assignment interval');
   const updated = await this.prisma.employeeLeavePolicyAssignment.update({ where: { id }, data: { effectiveTo: to } });
   await this.log(user,'EmployeeLeavePolicyAssignment',id,'EMPLOYEE_LEAVE_POLICY_ENDED'); return updated;
 }
 async policyFor(organizationId: string, employeeId: string, leaveTypeId: string, date: Date): Promise<Policy> {
   const assigned = await this.prisma.employeeLeavePolicyAssignment.findFirst({ where: { organizationId, employeeId, leaveTypeId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] }, include: { policy: true } });
   if (assigned) return assigned.policy;
   const policy = await this.prisma.leavePolicy.findFirst({ where: { organizationId, leaveTypeId, isDefault: true, isActive: true } });
   if (!policy) throw new NotFoundException('No active leave policy configured for this leave type');
   return policy;
 }
 async holidays(organizationId: string, from: Date, to: Date) {
   return this.prisma.companyPublicHoliday.findMany({ where: { organizationId, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } });
 }
 async addHoliday(user: TenantJwtUser, dto: CreatePublicHolidayDto) {
   const date = calendarDate(dto.date), name = dto.name?.trim(); if (!name) throw new BadRequestException('Holiday name required');
   try { const holiday = await this.prisma.companyPublicHoliday.create({ data: { organizationId: user.organizationId, date, name } }); await this.log(user,'CompanyPublicHoliday',holiday.id,'PUBLIC_HOLIDAY_CREATED'); return holiday; }
   catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Holiday date already exists'); throw error; }
 }
 async removeHoliday(user: TenantJwtUser, id: string) {
   const holiday = await this.prisma.companyPublicHoliday.findFirst({ where: { id, organizationId: user.organizationId } });
   if (!holiday) throw new NotFoundException('Holiday not found');
   await this.prisma.companyPublicHoliday.delete({ where: { id } }); await this.log(user,'CompanyPublicHoliday',id,'PUBLIC_HOLIDAY_REMOVED'); return { deleted: true };
 }
 async workingDays(organizationId: string, policy: Policy, from: Date, to: Date) {
   const holidays = policy.excludePublicHolidays ? await this.holidays(organizationId,from,to) : [];
   return countWorkingDays(from,to,policy.workingWeekdays,new Set(holidays.map(h => h.date.toISOString().slice(0,10))));
 }
 async workingDaysForEmployee(organizationId: string, employeeId: string, leaveTypeId: string, from: Date, to: Date) {
   if (to < from) throw new BadRequestException('End date precedes start date');
   const policy = await this.policyFor(organizationId,employeeId,leaveTypeId,from);
   return { policyId: policy.id, days: await this.workingDays(organizationId,policy,from,to) };
 }
 async adjust(user: TenantJwtUser, dto: AdjustLeaveBalanceDto) {
   const date = calendarDate(dto.effectiveDate);
   if (!Number.isFinite(dto.days) || dto.days <= 0 || dto.days > 365 || !dto.reason?.trim()) throw new BadRequestException('Positive days and reason required');
   if (!(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId } }))) throw new NotFoundException('Employee not found');
   await this.policyFor(user.organizationId,dto.employeeId,dto.leaveTypeId,date);
   const signed = dto.type === LeaveBalanceAdjustmentType.DEBIT ? -dto.days : dto.days;
   const adjustment = await this.prisma.$transaction(async tx => {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.organizationId}), hashtext(${dto.employeeId + ':' + dto.leaveTypeId}))`;
     if (signed < 0) {
       const policy = await this.policyFor(user.organizationId,dto.employeeId,dto.leaveTypeId,date);
       const balance = await this.balance(user.organizationId,dto.employeeId,dto.leaveTypeId,date);
       if (balance.available + signed < -policy.maxNegativeDays) throw new ConflictException('Adjustment would exceed negative leave balance limit');
     }
     return tx.leaveBalanceAdjustment.create({ data: { organizationId: user.organizationId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, effectiveDate: date, days: signed, type: dto.type, reason: dto.reason.trim(), actorUserId: user.sub } });
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
   await this.log(user,'LeaveBalanceAdjustment',adjustment.id,'LEAVE_BALANCE_ADJUSTED',dto.reason.trim()); return adjustment;
 }
 // Returns an annual balance. Carry-over is capped and may expire. Max lookback prevents unbounded historical recursion.
 async balance(organizationId: string, employeeId: string, leaveTypeId: string, asOf: Date, depth = 0): Promise<{ year: number; accrued: number; carryOver: number; adjustments: number; used: number; available: number; policyId: string }> {
   if (depth > 20) throw new BadRequestException('Balance history exceeds supported lookback');
   const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: { employmentStartDate: true } });
   if (!employee) throw new NotFoundException('Employee not found');
   const policy = await this.policyFor(organizationId,employeeId,leaveTypeId,asOf);
   const year = asOf.getUTCFullYear(), yearStart = new Date(Date.UTC(year,0,1));
   const accrued = accrualForYear(policy.accrualMode,policy.annualEntitlementDays,employee.employmentStartDate,asOf);
   let carryOver = 0;
   if (policy.carryOverMaxDays > 0 && policy.carryOverExpiryMonths > 0 && year > policy.createdAt.getUTCFullYear() && (!employee.employmentStartDate || employee.employmentStartDate < yearStart)) {
     const expiry = new Date(Date.UTC(year, policy.carryOverExpiryMonths, 1));
     if (asOf < expiry) {
       try { const prior = await this.balance(organizationId,employeeId,leaveTypeId,new Date(Date.UTC(year-1,11,31)),depth+1); carryOver = Math.min(policy.carryOverMaxDays,Math.max(0,prior.available)); }
       catch (error) { if (!(error instanceof NotFoundException)) throw error; }
     }
   }
   const [adjustments, requests] = await Promise.all([
     this.prisma.leaveBalanceAdjustment.findMany({ where: { organizationId, employeeId, leaveTypeId, effectiveDate: { gte: yearStart, lte: asOf } } }),
     this.prisma.leaveRequest.findMany({ where: { organizationId, employeeId, leaveTypeId, status: 'APPROVED', startDate: { lte: asOf } }, select: { chargedDays: true, chargeBreakdown: true, startDate: true, endDate: true } }),
   ]);
   const adjusted = adjustments.reduce((sum,a)=>sum+a.days,0);
   let used = 0;
   for (const request of requests) {
     const breakdown = request.chargeBreakdown as Record<string,number> | null;
     if (breakdown) used += Number(breakdown[String(year)] ?? 0);
     else if (request.chargedDays != null && request.startDate.getUTCFullYear() === year) used += request.chargedDays;
     else if (request.chargedDays == null && request.endDate >= yearStart) {
       const segmentStart = request.startDate > yearStart ? request.startDate : yearStart;
       const segmentEnd = request.endDate < asOf ? request.endDate : asOf;
       if (segmentEnd >= segmentStart) used += await this.workingDays(organizationId,policy,segmentStart,segmentEnd);
     }
   }
   const available = Math.round((accrued+carryOver+adjusted-used)*100)/100;
   return { year, accrued: Math.round(accrued*100)/100, carryOver, adjustments: adjusted, used, available, policyId: policy.id };
 }
 async calendar(organizationId: string, from: Date, to: Date) {
   if (to < from || (to.getTime()-from.getTime())/86400000 > 366) throw new BadRequestException('Invalid calendar range');
   const [holidays, leave] = await Promise.all([this.holidays(organizationId,from,to),this.prisma.leaveRequest.findMany({ where: { organizationId, status: 'APPROVED', startDate: { lte: to }, endDate: { gte: from } }, select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, endDate: true, chargedDays: true } })]);
   return { holidays, leave };
 }
}
