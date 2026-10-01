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

    const isPrimary = dto.isPrimary ?? true;

    const assignment = await this.prisma.$transaction(
      async (tx) => {
        if (isPrimary) {
          await tx.employeeWorkLocationAssignment.updateMany({
            where: {
              organizationId,
              employeeId,
              isPrimary: true,
              effectiveTo: null,
            },
            data: {
              effectiveTo: effectiveFrom,
              endedByUserId: actor.sub,
            },
          });
        }

        return tx.employeeWorkLocationAssignment.create({
          data: {
            organizationId,
            employeeId,
            workLocationId: location.id,
            isPrimary,
            effectiveFrom,
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
      },
    });

    return assignment;
  }

  async list(
    organizationId: string,
    employeeId: string,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    return this.prisma.employeeWorkLocationAssignment.findMany({
      where: {
        organizationId,
        employeeId,
      },
      include: {
        workLocation: true,
      },
      orderBy: [
        { effectiveTo: 'asc' },
        { effectiveFrom: 'desc' },
      ],
    });
  }

  async current(
    organizationId: string,
    employeeId: string,
  ) {
    await this.requireEmployee(organizationId, employeeId);

    const assignments =
      await this.prisma.employeeWorkLocationAssignment.findMany({
        where: {
          organizationId,
          employeeId,
          effectiveTo: null,
        },
        include: {
          workLocation: true,
        },
        orderBy: [
          { isPrimary: 'desc' },
          { effectiveFrom: 'desc' },
        ],
      });

    return {
      primary:
        assignments.find((assignment) => assignment.isPrimary) ??
        null,
      additional: assignments.filter(
        (assignment) => !assignment.isPrimary,
      ),
    };
  }

  private async requireEmployee(
    organizationId: string,
    employeeId: string,
  ) {
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
