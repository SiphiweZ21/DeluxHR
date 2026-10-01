import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { EndShiftAssignmentDto } from './dto/end-shift-assignment.dto';

@Injectable()
export class ShiftAssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private date(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Date must be YYYY-MM-DD');
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid calendar date');
    return parsed;
  }
  private async log(organizationId: string, actor: TenantJwtUser, entityId: string, action: string) {
    await this.audit.log({ organizationId, entity: 'ShiftAssignment', entityId, action, actorUserId: actor.sub, actorEmail: actor.email, actorRole: actor.role });
  }
  async create(organizationId: string, dto: CreateShiftAssignmentDto, actor: TenantJwtUser) {
    if (Boolean(dto.employeeId) === Boolean(dto.departmentId)) throw new BadRequestException('Specify exactly one employeeId or departmentId');
    const from = this.date(dto.effectiveFrom);
    const to = dto.effectiveTo ? this.date(dto.effectiveTo) : null;
    if (to && to <= from) throw new BadRequestException('effectiveTo must be later than effectiveFrom');
    const shift = await this.prisma.shiftDefinition.findFirst({ where: { id: dto.shiftId, organizationId, isActive: true } });
    if (!shift) throw new NotFoundException('Active shift not found');
    if (dto.employeeId && !(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId }, select: { id: true } }))) throw new NotFoundException('Employee not found');
    if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId }, select: { id: true } }))) throw new NotFoundException('Department not found');
    try {
      const assignment = await this.prisma.$transaction(async tx => {
        // Serialize writers for this tenant and target, including concurrent inserts.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${dto.employeeId ?? `department:${dto.departmentId}`}))`;
        const overlap = await tx.shiftAssignment.findFirst({ where: { organizationId, ...(dto.employeeId ? { employeeId: dto.employeeId } : { departmentId: dto.departmentId }), effectiveFrom: { lt: to ?? new Date('9999-12-31') }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] } });
        if (overlap) throw new ConflictException('Assignment dates overlap an existing assignment for this target');
        return tx.shiftAssignment.create({ data: { organizationId, shiftId: shift.id, employeeId: dto.employeeId, departmentId: dto.departmentId, effectiveFrom: from, effectiveTo: to, assignedByUserId: actor.sub }, include: { shift: true } });
      });
      await this.log(organizationId, actor, assignment.id, 'SHIFT_ASSIGNED');
      return assignment;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new BadRequestException('Assignment target is no longer available'); throw error; }
  }
  async list(organizationId: string, employeeId?: string, departmentId?: string) {
    if (employeeId && departmentId) throw new BadRequestException('Filter by one target');
    if (employeeId && !(await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: { id: true } }))) throw new NotFoundException('Employee not found');
    if (departmentId && !(await this.prisma.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } }))) throw new NotFoundException('Department not found');
    return this.prisma.shiftAssignment.findMany({ where: { organizationId, ...(employeeId ? { employeeId } : {}), ...(departmentId ? { departmentId } : {}) }, include: { shift: true }, orderBy: { effectiveFrom: 'desc' }, take: 200 });
  }
  async effective(organizationId: string, employeeId: string, date?: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: { departmentId: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    const day = date ? this.date(date) : this.date(new Date().toISOString().slice(0, 10));
    const common = { organizationId, effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: day } }] };
    const employeeAssignment = await this.prisma.shiftAssignment.findFirst({ where: { ...common, employeeId }, include: { shift: true } });
    if (employeeAssignment) return { source: 'EMPLOYEE', assignment: employeeAssignment };
    const departmentAssignment = await this.prisma.shiftAssignment.findFirst({ where: { ...common, departmentId: employee.departmentId }, include: { shift: true } });
    return departmentAssignment ? { source: 'DEPARTMENT', assignment: departmentAssignment } : { source: null, assignment: null };
  }
  async end(organizationId: string, id: string, dto: EndShiftAssignmentDto, actor: TenantJwtUser) {
    const endDate = this.date(dto.effectiveTo);
    const assignment = await this.prisma.shiftAssignment.findFirst({ where: { id, organizationId } });
    if (!assignment) throw new NotFoundException('Shift assignment not found');
    if (endDate <= assignment.effectiveFrom || (assignment.effectiveTo && endDate > assignment.effectiveTo)) throw new BadRequestException('End date must fall within the assignment interval');
    const updated = await this.prisma.shiftAssignment.update({ where: { id: assignment.id }, data: { effectiveTo: endDate }, include: { shift: true } });
    await this.log(organizationId, actor, id, 'SHIFT_ASSIGNMENT_ENDED');
    return updated;
  }
}
