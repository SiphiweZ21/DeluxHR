import {
  Injectable,
} from '@nestjs/common';
import {
  AttendanceEventType,
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { DetectMissingCheckoutDto } from './dto/detect-missing-checkout.dto';
import { AttendanceExceptionQueryDto } from './dto/attendance-exception-query.dto';

@Injectable()
export class AttendanceExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async detectMissingCheckouts(
    user: TenantJwtUser,
    dto: DetectMissingCheckoutDto,
  ) {
    const cutoff = new Date(
      Date.now() -
        dto.olderThanHours * 60 * 60 * 1000,
    );

    const employeeFilter: Prisma.EmployeeWhereInput = {
      organizationId: user.organizationId,
      ...(dto.employeeId
        ? { id: dto.employeeId }
        : {}),
    };

    const employees = await this.prisma.employee.findMany({
      where: employeeFilter,
      select: { id: true },
    });

    const employeeIds = employees.map((employee) => employee.id);

    if (employeeIds.length === 0) {
      return {
        scannedEmployees: 0,
        created: 0,
        alreadyOpen: 0,
        skipped: 0,
        cutoff,
        exceptions: [],
      };
    }

    const latestEvents =
      await this.prisma.attendanceEvent.findMany({
        where: {
          organizationId: user.organizationId,
          employeeId: { in: employeeIds },
          ...(dto.workLocationId
            ? { workLocationId: dto.workLocationId }
            : {}),
        },
        orderBy: [
          { employeeId: 'asc' },
          { capturedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        distinct: ['employeeId'],
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
            },
          },
          workLocation: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

    let created = 0;
    let alreadyOpen = 0;
    let skipped = 0;
    const exceptions: Array<{
      id: string;
      employeeId: string;
      sourceAttendanceEventId: string | null;
      status: AttendanceExceptionStatus;
    }> = [];

    for (const event of latestEvents) {
      if (
        event.eventType !==
          AttendanceEventType.CHECK_IN ||
        event.capturedAt > cutoff
      ) {
        skipped += 1;
        continue;
      }

      const existing =
        await this.prisma.attendanceException.findFirst({
          where: {
            organizationId: user.organizationId,
            type:
              AttendanceExceptionType.MISSING_CHECK_OUT,
            sourceAttendanceEventId: event.id,
          },
          select: {
            id: true,
            employeeId: true,
            sourceAttendanceEventId: true,
            status: true,
          },
        });

      if (existing) {
        alreadyOpen += 1;
        exceptions.push(existing);
        continue;
      }

      const exception =
        await this.prisma.attendanceException.create({
          data: {
            organizationId: user.organizationId,
            employeeId: event.employeeId,
            workLocationId: event.workLocationId,
            type:
              AttendanceExceptionType.MISSING_CHECK_OUT,
            status: AttendanceExceptionStatus.OPEN,
            sourceAttendanceEventId: event.id,
            detectedAt: new Date(),
            expectedBy: cutoff,
            note:
              `Open check-in exceeded the ${dto.olderThanHours}-hour operational review threshold. This is an attendance exception only and does not determine absence or pay.`,
          },
          select: {
            id: true,
            employeeId: true,
            sourceAttendanceEventId: true,
            status: true,
          },
        });

      created += 1;
      exceptions.push(exception);

      await this.auditService.log({
        organizationId: user.organizationId,
        action:
          'ATTENDANCE_MISSING_CHECK_OUT_DETECTED',
        entity: 'AttendanceException',
        entityId: exception.id,
        actorUserId: user.sub,
        actorEmail: user.email,
        actorRole: user.role,
        metadata: {
          employeeId: event.employeeId,
          employeeNumber:
            event.employee.employeeNumber,
          sourceAttendanceEventId: event.id,
          workLocationId:
            event.workLocationId,
          checkInCapturedAt:
            event.capturedAt.toISOString(),
          olderThanHours:
            dto.olderThanHours,
          payrollEffect: 'NONE',
        },
      });
    }

    await this.auditService.log({
      organizationId: user.organizationId,
      action:
        'ATTENDANCE_MISSING_CHECK_OUT_SCAN_COMPLETED',
      entity: 'Organization',
      entityId: user.organizationId,
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: {
        employeeId: dto.employeeId ?? null,
        workLocationId:
          dto.workLocationId ?? null,
        olderThanHours:
          dto.olderThanHours,
        cutoff: cutoff.toISOString(),
        scannedEmployees:
          employeeIds.length,
        latestEvents:
          latestEvents.length,
        created,
        alreadyOpen,
        skipped,
      },
    });

    return {
      scannedEmployees: employeeIds.length,
      latestEvents: latestEvents.length,
      created,
      alreadyOpen,
      skipped,
      cutoff,
      exceptions,
      notice:
        'Missing check-out exceptions require review. They do not automatically mark an employee absent, unpaid, or change payroll.',
    };
  }

  async list(
    organizationId: string,
    query: AttendanceExceptionQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.AttendanceExceptionWhereInput = {
      organizationId,
      ...(query.employeeId
        ? { employeeId: query.employeeId }
        : {}),
      ...(query.workLocationId
        ? { workLocationId: query.workLocationId }
        : {}),
      ...(query.type
        ? { type: query.type }
        : {}),
      ...(query.status
        ? { status: query.status }
        : {}),
    };

    const [total, exceptions] =
      await this.prisma.$transaction([
        this.prisma.attendanceException.count({
          where,
        }),
        this.prisma.attendanceException.findMany({
          where,
          orderBy: [
            { detectedAt: 'desc' },
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
          },
        }),
      ]);

    return {
      page,
      pageSize,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / pageSize),
      exceptions: exceptions.map(
        (exception) => ({
          id: exception.id,
          type: exception.type,
          status: exception.status,
          employee: {
            id: exception.employee.id,
            employeeNumber:
              exception.employee.employeeNumber,
            displayName:
              `${exception.employee.firstName} ${exception.employee.lastName}`.trim(),
          },
          workLocation:
            exception.workLocation
              ? {
                  id:
                    exception.workLocation.id,
                  code:
                    exception.workLocation.code,
                  name:
                    exception.workLocation.name,
                  type:
                    exception.workLocation.type,
                }
              : null,
          sourceAttendanceEventId:
            exception.sourceAttendanceEventId,
          detectedAt: exception.detectedAt,
          expectedBy: exception.expectedBy,
          note: exception.note,
          scheduledDate: exception.scheduledDate,
          employeeExplanation: exception.employeeExplanation,
          explainedAt: exception.explainedAt,
          resolvedAt: exception.resolvedAt,
          resolvedByUserId:
            exception.resolvedByUserId,
          resolutionNote:
            exception.resolutionNote,
        }),
      ),
    };
  }
}
