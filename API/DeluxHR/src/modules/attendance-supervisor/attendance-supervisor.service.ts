import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceChannel,
  AttendanceEventSyncStatus,
  AttendanceEventType,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { SupervisorAttendanceDto } from './dto/supervisor-attendance.dto';

@Injectable()
export class AttendanceSupervisorService {
  private static readonly MAX_FUTURE_SKEW_MS =
    5 * 60 * 1000;
  private static readonly MAX_BACKDATE_MS =
    7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async clock(
    user: TenantJwtUser,
    dto: SupervisorAttendanceDto,
  ) {
    this.requireSupervisorRole(user);

    const capturedAt = new Date(dto.capturedAt);
    this.validateCapturedAt(capturedAt);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'Employee not found',
      );
    }

    const workLocation =
      await this.prisma.workLocation.findFirst({
        where: {
          id: dto.workLocationId,
          organizationId: user.organizationId,
          isActive: true,
        },
      });

    if (!workLocation) {
      throw new NotFoundException(
        'Active work location not found',
      );
    }

    const assignment =
      await this.prisma.employeeWorkLocationAssignment.findFirst({
        where: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          workLocationId: workLocation.id,
          effectiveTo: null,
        },
      });

    if (!assignment) {
      throw new ForbiddenException(
        'Employee is not currently assigned to this work location',
      );
    }

    await this.requireSupervisorPolicy(
      user.organizationId,
      workLocation.id,
    );

    const receivedAt = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
        // Evaluate attendance state at the supplied captured time.
        // This allows a supervisor to record a genuine earlier event without
        // treating receivedAt as the employee's attendance time.
        const previous =
          await tx.attendanceEvent.findFirst({
            where: {
              organizationId: user.organizationId,
              employeeId: employee.id,
              capturedAt: {
                lte: capturedAt,
              },
            },
            orderBy: [
              { capturedAt: 'desc' },
              { createdAt: 'desc' },
            ],
          });

        if (
          dto.eventType === AttendanceEventType.CHECK_IN &&
          previous?.eventType === AttendanceEventType.CHECK_IN
        ) {
          throw new ConflictException(
            'Employee was already checked in at the supplied attendance time',
          );
        }

        if (
          dto.eventType === AttendanceEventType.CHECK_OUT &&
          (!previous ||
            previous.eventType !== AttendanceEventType.CHECK_IN)
        ) {
          throw new ConflictException(
            'Employee was not checked in at the supplied attendance time',
          );
        }

        return tx.attendanceEvent.create({
          data: {
            organizationId: user.organizationId,
            employeeId: employee.id,
            workLocationId: workLocation.id,
            eventType: dto.eventType,
            channel: AttendanceChannel.SUPERVISOR,
            capturedAt,
            receivedAt,
            syncStatus:
              AttendanceEventSyncStatus.RECEIVED,
            sourceReference:
              'SUPERVISOR_FALLBACK',
            createdByUserId: user.sub,
            metadata: {
              reason: dto.reason.trim(),
              ...(dto.note?.trim()
                ? { note: dto.note.trim() }
                : {}),
              recordedByUserId: user.sub,
              recordedAt:
                receivedAt.toISOString(),
            },
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    // If this supervisor fallback CHECK_OUT resolves a currently open
    // MISSING_CHECK_OUT exception whose source CHECK_IN precedes this event,
    // we do NOT silently resolve it here. 6A.15 owns correction/review
    // semantics. The supervisor event becomes evidence for that review.

    await this.auditService.log({
      organizationId: user.organizationId,
      action:
        dto.eventType === AttendanceEventType.CHECK_IN
          ? 'SUPERVISOR_FALLBACK_CHECK_IN_RECORDED'
          : 'SUPERVISOR_FALLBACK_CHECK_OUT_RECORDED',
      entity: 'AttendanceEvent',
      entityId: event.id,
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      reason: dto.reason.trim(),
      metadata: {
        employeeId: employee.id,
        employeeNumber:
          employee.employeeNumber,
        workLocationId:
          workLocation.id,
        workLocationCode:
          workLocation.code,
        eventType: event.eventType,
        capturedAt:
          event.capturedAt.toISOString(),
        receivedAt:
          event.receivedAt.toISOString(),
        ...(dto.note?.trim()
          ? { note: dto.note.trim() }
          : {}),
        payrollEffect: 'NONE',
      },
    });

    return {
      status:
        event.eventType === AttendanceEventType.CHECK_IN
          ? 'CHECKED_IN'
          : 'CHECKED_OUT',
      fallback: true,
      employee: {
        id: employee.id,
        employeeNumber:
          employee.employeeNumber,
        displayName:
          `${employee.firstName} ${employee.lastName}`.trim(),
      },
      workLocation: {
        id: workLocation.id,
        code: workLocation.code,
        name: workLocation.name,
        type: workLocation.type,
      },
      event: {
        id: event.id,
        eventType: event.eventType,
        channel: event.channel,
        capturedAt: event.capturedAt,
        receivedAt: event.receivedAt,
        createdByUserId:
          event.createdByUserId,
      },
      reason: dto.reason.trim(),
      notice:
        'Supervisor fallback attendance is an auditable attendance event. It does not automatically change payroll or resolve attendance exceptions.',
    };
  }

  private requireSupervisorRole(
    user: TenantJwtUser,
  ) {
    // MANAGER currently has VIEW_ATTENDANCE but not MANAGE_ATTENDANCE in
    // the existing permission preset. We intentionally do not broaden
    // permissions in 6A.14. 6A.16 will perform the final attendance
    // permission/security review.
    if (
      user.role !== UserRole.COMPANY_ADMIN &&
      user.role !== UserRole.HR_ADMIN
    ) {
      throw new ForbiddenException(
        'Supervisor fallback attendance currently requires Company Admin or HR Admin access',
      );
    }
  }

  private async requireSupervisorPolicy(
    organizationId: string,
    workLocationId: string,
  ) {
    const locationPolicy =
      await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId,
          workLocationId,
          isActive: true,
          isDefault: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

    const policy =
      locationPolicy ??
      (await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId,
          workLocationId: null,
          isActive: true,
          isDefault: true,
        },
        orderBy: { updatedAt: 'desc' },
      }));

    if (!policy) {
      throw new BadRequestException(
        'No active default attendance policy is configured for this work location',
      );
    }

    if (
      !policy.attendanceRequired ||
      !policy.allowedChannels.includes(
        AttendanceChannel.SUPERVISOR,
      )
    ) {
      throw new ForbiddenException(
        'Supervisor fallback attendance is not allowed by the effective attendance policy',
      );
    }
  }

  private validateCapturedAt(
    capturedAt: Date,
  ) {
    if (
      Number.isNaN(capturedAt.getTime())
    ) {
      throw new BadRequestException(
        'Invalid capturedAt timestamp',
      );
    }

    const now = Date.now();

    if (
      capturedAt.getTime() >
      now +
        AttendanceSupervisorService.MAX_FUTURE_SKEW_MS
    ) {
      throw new BadRequestException(
        'Supervisor attendance time cannot be more than five minutes in the future',
      );
    }

    if (
      capturedAt.getTime() <
      now -
        AttendanceSupervisorService.MAX_BACKDATE_MS
    ) {
      throw new BadRequestException(
        'Supervisor fallback attendance cannot be backdated by more than seven days',
      );
    }
  }
}
