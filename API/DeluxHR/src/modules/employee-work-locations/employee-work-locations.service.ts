import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { AssignEmployeeWorkLocationDto } from './dto/assign-employee-work-location.dto';

@Injectable()
export class EmployeeWorkLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async assign(
    organizationId: string,
    employeeId: string,
    dto: AssignEmployeeWorkLocationDto,
    actor: TenantJwtUser,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const location = await this.prisma.workLocation.findFirst({
      where: {
        id: dto.workLocationId,
        organizationId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Work location not found');
    }

    if (!location.isActive) {
      throw new BadRequestException(
        'Employee cannot be assigned to an inactive work location',
      );
    }

    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();

    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('Invalid effectiveFrom date');
    }

    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (
      effectiveTo &&
      (Number.isNaN(effectiveTo.getTime()) || effectiveTo <= effectiveFrom)
    ) {
      throw new BadRequestException(
        'End date must be later than the start date',
      );
    }
    const isPrimary = dto.isPrimary ?? true;

    const assignment = await this.prisma.$transaction(
      async (tx) => {
        if (isPrimary) {
          const overlaps = await tx.employeeWorkLocationAssignment.findMany({
            where: {
              organizationId,
              employeeId,
              isPrimary: true,
              ...(effectiveTo ? { effectiveFrom: { lt: effectiveTo } } : {}),
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gt: effectiveFrom } },
              ],
            },
          });
          if (overlaps.some((x) => x.effectiveFrom >= effectiveFrom)) {
            throw new BadRequestException(
              'A primary site assignment starts on or after this date. End or shorten that assignment first, or choose a later start date.',
            );
          }
          for (const previous of overlaps) {
            await tx.employeeWorkLocationAssignment.update({
              where: { id: previous.id },
              data: { effectiveTo: effectiveFrom, endedByUserId: actor.sub },
            });
          }
        }

        return tx.employeeWorkLocationAssignment.create({
          data: {
            organizationId,
            employeeId,
            workLocationId: location.id,
            isPrimary,
            effectiveFrom,
            effectiveTo,
            assignedByUserId: actor.sub,
          },
          include: {
            workLocation: true,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_WORK_LOCATION_ASSIGNED',
      entity: 'EmployeeWorkLocationAssignment',
      entityId: assignment.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId,
        employeeNumber: employee.employeeNumber,
        workLocationId: location.id,
        workLocationCode: location.code,
        workLocationName: location.name,
        isPrimary,
        effectiveFrom: assignment.effectiveFrom.toISOString(),
        effectiveTo: assignment.effectiveTo?.toISOString() ?? null,
      },
    });

    return assignment;
  }

  async end(
    organizationId: string,
    employeeId: string,
    assignmentId: string,
    value: string,
    actor: TenantJwtUser,
  ) {
    const effectiveTo = new Date(value);
    if (Number.isNaN(effectiveTo.getTime()))
      throw new BadRequestException('Invalid end date');
    const assignment = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.employeeWorkLocationAssignment.findFirst({
          where: { id: assignmentId, organizationId, employeeId },
        });
        if (!existing) throw new NotFoundException('Site assignment not found');
        if (effectiveTo <= existing.effectiveFrom)
          throw new BadRequestException(
            'End date must be later than the start date',
          );
        if (existing.effectiveTo && effectiveTo > existing.effectiveTo)
          throw new BadRequestException(
            'An assignment can only be ended or shortened',
          );
        return tx.employeeWorkLocationAssignment.update({
          where: { id: existing.id },
          data: { effectiveTo, endedByUserId: actor.sub },
          include: { workLocation: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.auditService.log({
      organizationId,
      action: 'EMPLOYEE_WORK_LOCATION_ENDED',
      entity: 'EmployeeWorkLocationAssignment',
      entityId: assignment.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId,
        workLocationId: assignment.workLocationId,
        effectiveTo: effectiveTo.toISOString(),
      },
    });
    return assignment;
  }

  async list(organizationId: string, employeeId: string) {
    await this.requireEmployee(organizationId, employeeId);

    return this.prisma.employeeWorkLocationAssignment.findMany({
      where: {
        organizationId,
        employeeId,
      },
      include: {
        workLocation: true,
      },
      orderBy: [{ effectiveTo: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async current(organizationId: string, employeeId: string) {
    await this.requireEmployee(organizationId, employeeId);

    const now = new Date();
    const assignments =
      await this.prisma.employeeWorkLocationAssignment.findMany({
        where: {
          organizationId,
          employeeId,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        include: {
          workLocation: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }],
      });

    return {
      primary: assignments.find((assignment) => assignment.isPrimary) ?? null,
      additional: assignments.filter((assignment) => !assignment.isPrimary),
    };
  }

  private async requireEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }
}
