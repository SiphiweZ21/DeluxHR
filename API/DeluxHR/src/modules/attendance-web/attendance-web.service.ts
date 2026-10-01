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
import { WebAttendanceDto } from './dto/web-attendance.dto';

@Injectable()
export class AttendanceWebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async status(user: TenantJwtUser) {
    const employee = await this.requireSelfEmployee(user);
    const open = await this.getOpenSession(
      user.organizationId,
      employee.id,
    );

    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      checkedIn: Boolean(open),
      openCheckIn: open,
    };
  }

  async checkIn(
    user: TenantJwtUser,
    dto: WebAttendanceDto,
  ) {
    const employee = await this.requireSelfEmployee(user);
    const organizationId = user.organizationId;

    const location = await this.resolveLocation(
      organizationId,
      employee.id,
      dto.workLocationId,
    );

    await this.validatePolicy(
      organizationId,
      location?.id,
      dto,
    );

    const now = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.attendanceEvent.findFirst({
          where: {
            organizationId,
            employeeId: employee.id,
            channel: AttendanceChannel.WEB,
          },
          orderBy: [
            { capturedAt: 'desc' },
            { createdAt: 'desc' },
          ],
        });

        if (
          latest?.eventType ===
          AttendanceEventType.CHECK_IN
        ) {
          throw new ConflictException(
            'Employee is already checked in',
          );
        }

        return tx.attendanceEvent.create({
          data: {
            organizationId,
            employeeId: employee.id,
            workLocationId: location?.id,
            eventType: AttendanceEventType.CHECK_IN,
            channel: AttendanceChannel.WEB,
            capturedAt: now,
            receivedAt: now,
            syncStatus:
              AttendanceEventSyncStatus.RECEIVED,
            latitude: dto.latitude,
            longitude: dto.longitude,
            locationAccuracyM: dto.locationAccuracyM,
            sourceReference: 'EMPLOYEE_WEB_SELF_SERVICE',
            createdByUserId: user.sub,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.writeAudit(
      organizationId,
      event.id,
      employee.id,
      employee.employeeNumber,
      event.eventType,
      event.workLocationId,
      user,
    );

    return {
      status: 'CHECKED_IN',
      event,
    };
  }

  async checkOut(
    user: TenantJwtUser,
    dto: WebAttendanceDto,
  ) {
    const employee = await this.requireSelfEmployee(user);
    const organizationId = user.organizationId;

    const open = await this.getOpenSession(
      organizationId,
      employee.id,
    );

    if (!open) {
      throw new ConflictException(
        'Employee is not currently checked in',
      );
    }

    const location = await this.resolveLocation(
      organizationId,
      employee.id,
      dto.workLocationId ?? open.workLocationId ?? undefined,
    );

    await this.validatePolicy(
      organizationId,
      location?.id,
      dto,
    );

    const now = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.attendanceEvent.findFirst({
          where: {
            organizationId,
            employeeId: employee.id,
            channel: AttendanceChannel.WEB,
          },
          orderBy: [
            { capturedAt: 'desc' },
            { createdAt: 'desc' },
          ],
        });

        if (
          !latest ||
          latest.eventType !==
            AttendanceEventType.CHECK_IN
        ) {
          throw new ConflictException(
            'Employee is not currently checked in',
          );
        }

        return tx.attendanceEvent.create({
          data: {
            organizationId,
            employeeId: employee.id,
            workLocationId:
              location?.id ?? latest.workLocationId,
            eventType: AttendanceEventType.CHECK_OUT,
            channel: AttendanceChannel.WEB,
            capturedAt: now,
            receivedAt: now,
            syncStatus:
              AttendanceEventSyncStatus.RECEIVED,
            latitude: dto.latitude,
            longitude: dto.longitude,
            locationAccuracyM: dto.locationAccuracyM,
            sourceReference: 'EMPLOYEE_WEB_SELF_SERVICE',
            createdByUserId: user.sub,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.writeAudit(
      organizationId,
      event.id,
      employee.id,
      employee.employeeNumber,
      event.eventType,
      event.workLocationId,
      user,
    );

    return {
      status: 'CHECKED_OUT',
      event,
    };
  }

  private async requireSelfEmployee(
    user: TenantJwtUser,
  ) {
    if (user.role !== UserRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Web self-service attendance is available to employee accounts only',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: user.sub,
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
        'Employee profile is not linked to this user account',
      );
    }

    return employee;
  }

  private async resolveLocation(
    organizationId: string,
    employeeId: string,
    requestedLocationId?: string,
  ) {
    if (requestedLocationId) {
      const assigned =
        await this.prisma.employeeWorkLocationAssignment.findFirst({
          where: {
            organizationId,
            employeeId,
            workLocationId: requestedLocationId,
            effectiveTo: null,
          },
          include: {
            workLocation: true,
          },
        });

      if (!assigned) {
        throw new ForbiddenException(
          'Employee is not currently assigned to this work location',
        );
      }

      if (!assigned.workLocation.isActive) {
        throw new BadRequestException(
          'Assigned work location is inactive',
        );
      }

      return assigned.workLocation;
    }

    const primary =
      await this.prisma.employeeWorkLocationAssignment.findFirst({
        where: {
          organizationId,
          employeeId,
          isPrimary: true,
          effectiveTo: null,
        },
        include: {
          workLocation: true,
        },
        orderBy: {
          effectiveFrom: 'desc',
        },
      });

    if (!primary) {
      return null;
    }

    if (!primary.workLocation.isActive) {
      throw new BadRequestException(
        'Primary work location is inactive',
      );
    }

    return primary.workLocation;
  }

  private async validatePolicy(
    organizationId: string,
    workLocationId: string | undefined,
    dto: WebAttendanceDto,
  ) {
    const locationPolicy = workLocationId
      ? await this.prisma.attendancePolicy.findFirst({
          where: {
            organizationId,
            workLocationId,
            isActive: true,
            isDefault: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        })
      : null;

    const policy =
      locationPolicy ??
      (await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId,
          workLocationId: null,
          isActive: true,
          isDefault: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }));

    if (!policy) {
      throw new BadRequestException(
        'No active default attendance policy is configured for this employee',
      );
    }

    if (!policy.attendanceRequired) {
      throw new ForbiddenException(
        'Attendance capture is disabled by the effective attendance policy',
      );
    }

    if (
      !policy.allowedChannels.includes(
        AttendanceChannel.WEB,
      )
    ) {
      throw new ForbiddenException(
        'Web attendance is not allowed by the effective attendance policy',
      );
    }

    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Latitude and longitude must be supplied together',
      );
    }

    if (
      dto.locationAccuracyM !== undefined &&
      (!hasLatitude || !hasLongitude)
    ) {
      throw new BadRequestException(
        'Location accuracy requires latitude and longitude',
      );
    }

    if (
      policy.locationVerificationRequired &&
      (!hasLatitude || !hasLongitude)
    ) {
      throw new BadRequestException(
        'Location evidence is required by the effective attendance policy',
      );
    }
  }

  private async getOpenSession(
    organizationId: string,
    employeeId: string,
  ) {
    const latest =
      await this.prisma.attendanceEvent.findFirst({
        where: {
          organizationId,
          employeeId,
          channel: AttendanceChannel.WEB,
        },
        include: {
          workLocation: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: [
          { capturedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });

    if (
      !latest ||
      latest.eventType !== AttendanceEventType.CHECK_IN
    ) {
      return null;
    }

    return latest;
  }

  private async writeAudit(
    organizationId: string,
    eventId: string,
    employeeId: string,
    employeeNumber: string,
    eventType: AttendanceEventType,
    workLocationId: string | null,
    actor: TenantJwtUser,
  ) {
    await this.auditService.log({
      organizationId,
      action:
        eventType === AttendanceEventType.CHECK_IN
          ? 'WEB_ATTENDANCE_CHECKED_IN'
          : 'WEB_ATTENDANCE_CHECKED_OUT',
      entity: 'AttendanceEvent',
      entityId: eventId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId,
        employeeNumber,
        workLocationId,
        channel: AttendanceChannel.WEB,
        eventType,
      },
    });
  }
}
