import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataScope,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { AttendanceHistoryQueryDto } from './dto/attendance-history-query.dto';

@Injectable()
export class AttendanceHistoryService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async myHistory(
    user: TenantJwtUser,
    query: AttendanceHistoryQueryDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: user.sub,
      },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException(
        'Employee profile is not linked to this user account',
      );
    }

    return this.list(user.organizationId, {
      ...query,
      employeeId: employee.id,
    });
  }

  async employeeHistory(
    user: TenantJwtUser,
    employeeId: string,
    query: AttendanceHistoryQueryDto,
  ) {
    const employee = await this.requireEmployee(
      user.organizationId,
      employeeId,
    );

    await this.enforceAttendanceScope(
      user,
      employee.id,
      employee.departmentId,
    );

    return this.list(user.organizationId, {
      ...query,
      employeeId: employee.id,
    });
  }

  async organizationHistory(
    user: TenantJwtUser,
    query: AttendanceHistoryQueryDto,
  ) {
    const scope = await this.attendanceScope(user);

    if (
      scope === DataScope.SELF ||
      user.role === UserRole.EMPLOYEE
    ) {
      throw new ForbiddenException(
        'Organization attendance history is not available to self-scoped users',
      );
    }

    if (scope === DataScope.ORGANIZATION) {
      return this.list(user.organizationId, query);
    }

    throw new ForbiddenException(
      'Broad attendance history requires organization scope. Use the employee-specific history endpoint for scoped access.',
    );
  }

  private async list(
    organizationId: string,
    query: AttendanceHistoryQueryDto,
  ) {
    const { from, to } = this.parseDateRange(query.from, query.to);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.AttendanceEventWhereInput = {
      organizationId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.workLocationId ? { workLocationId: query.workLocationId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.locationVerificationStatus
        ? { locationVerificationStatus: query.locationVerificationStatus }
        : {}),
      ...(from || to
        ? {
            capturedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.attendanceEvent.count({ where }),
      this.prisma.attendanceEvent.findMany({
        where,
        orderBy: [
          { capturedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              departmentId: true,
            },
          },
          workLocation: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
            },
          },
          attendanceCorrection: {
            include: {
              correctedWorkLocation: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      filters: {
        employeeId: query.employeeId ?? null,
        workLocationId: query.workLocationId ?? null,
        channel: query.channel ?? null,
        eventType: query.eventType ?? null,
        locationVerificationStatus:
          query.locationVerificationStatus ?? null,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      events: events.map((event) => {
        const correction = event.attendanceCorrection;
        const effectiveLocation =
          correction?.correctedWorkLocation ?? event.workLocation;

        return {
          id: event.id,
          employee: {
            id: event.employee.id,
            employeeNumber: event.employee.employeeNumber,
            displayName:
              `${event.employee.firstName} ${event.employee.lastName}`.trim(),
            departmentId: event.employee.departmentId,
          },
          workLocation: effectiveLocation
            ? {
                id: effectiveLocation.id,
                code: effectiveLocation.code,
                name: effectiveLocation.name,
                type: effectiveLocation.type,
              }
            : null,
          eventType:
            correction?.correctedEventType ?? event.eventType,
          channel: event.channel,
          capturedAt:
            correction?.correctedCapturedAt ?? event.capturedAt,
          receivedAt: event.receivedAt,
          syncedAt: event.syncedAt,
          syncStatus: event.syncStatus,
          recordedOffline: event.syncStatus === 'SYNCED_OFFLINE',
          locationVerificationStatus:
            event.locationVerificationStatus,
          distanceFromWorkLocationM:
            event.distanceFromWorkLocationM,
          // Exact coordinates remain stored as evidence but are not exposed
          // by the general attendance-history endpoint.
          locationEvidenceCaptured:
            event.latitude !== null && event.longitude !== null,
          sourceReference: event.sourceReference,
          deviceReference: event.deviceReference,
          correction: correction
            ? {
                id: correction.id,
                correctedAt: correction.correctedAt,
                correctedByUserId: correction.correctedByUserId,
                reason: correction.reason,
                note: correction.note,
                original: {
                  eventType: event.eventType,
                  capturedAt: event.capturedAt,
                  workLocation: event.workLocation
                    ? {
                        id: event.workLocation.id,
                        code: event.workLocation.code,
                        name: event.workLocation.name,
                        type: event.workLocation.type,
                      }
                    : null,
                },
              }
            : null,
        };
      }),
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
      select: {
        id: true,
        departmentId: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async enforceAttendanceScope(
    user: TenantJwtUser,
    employeeId: string,
    employeeDepartmentId: string | null,
  ) {
    const scope = await this.attendanceScope(user);

    if (scope === DataScope.ORGANIZATION) return;

    const ownEmployee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: user.sub,
      },
      select: {
        id: true,
        departmentId: true,
      },
    });

    if (!ownEmployee) {
      throw new ForbiddenException(
        'User is not linked to an employee profile',
      );
    }

    if (
      scope === DataScope.SELF &&
      ownEmployee.id !== employeeId
    ) {
      throw new ForbiddenException(
        'Attendance access is limited to your own records',
      );
    }

    if (
      scope === DataScope.DEPARTMENT &&
      (!ownEmployee.departmentId ||
        ownEmployee.departmentId !== employeeDepartmentId)
    ) {
      throw new ForbiddenException(
        'Attendance access is limited to your department',
      );
    }

    if (scope === DataScope.TEAM) {
      if (ownEmployee.id === employeeId) return;

      throw new ForbiddenException(
        'Team-scoped attendance requires an explicit manager/team relationship. This will be enabled with the supervisor/team workflow.',
      );
    }
  }

  private async attendanceScope(
    user: TenantJwtUser,
  ): Promise<DataScope> {
    if (
      user.role === UserRole.COMPANY_ADMIN ||
      user.role === UserRole.HR_ADMIN ||
      user.role === UserRole.EXECUTIVE
    ) {
      return DataScope.ORGANIZATION;
    }

    const grant = await this.prisma.userPermission.findFirst({
      where: {
        userId: user.sub,
        permission: 'VIEW_ATTENDANCE',
      },
      select: { scope: true },
    });

    if (grant?.scope) return grant.scope;
    if (user.role === UserRole.MANAGER) return DataScope.TEAM;
    return DataScope.SELF;
  }

  private parseDateRange(
    fromValue?: string,
    toValue?: string,
  ): { from?: Date; to?: Date } {
    const from = fromValue ? new Date(fromValue) : undefined;
    const to = toValue ? new Date(toValue) : undefined;

    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid from date');
    }
    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid to date');
    }
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'from must be before or equal to to',
      );
    }

    return { from, to };
  }
}
