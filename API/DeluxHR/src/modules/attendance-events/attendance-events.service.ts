import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceChannel,
  AttendanceEventSyncStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateAttendanceEventDto } from './dto/create-attendance-event.dto';

@Injectable()
export class AttendanceEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateAttendanceEventDto,
    actor: TenantJwtUser,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        organizationId,
      },
      select: {
        id: true,
        employeeNumber: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const workLocation = dto.workLocationId
      ? await this.prisma.workLocation.findFirst({
          where: {
            id: dto.workLocationId,
            organizationId,
          },
          select: {
            id: true,
            code: true,
            isActive: true,
          },
        })
      : null;

    if (dto.workLocationId && !workLocation) {
      throw new NotFoundException('Work location not found');
    }

    if (workLocation && !workLocation.isActive) {
      throw new BadRequestException(
        'Attendance event cannot be recorded against an inactive work location',
      );
    }

    const capturedAt = new Date(dto.capturedAt);

    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('Invalid capturedAt timestamp');
    }

    const now = new Date();

    // Direct channel capture must not be able to backdate events materially.
    // Offline historical capture gets a dedicated authenticated sync endpoint
    // in 6A.10 with replay/device controls.
    const fiveMinutesMs = 5 * 60 * 1000;
    if (capturedAt.getTime() < now.getTime() - fiveMinutesMs) {
      throw new BadRequestException(
        'Historical attendance capture must use the offline synchronization flow',
      );
    }

    if (capturedAt.getTime() > now.getTime() + fiveMinutesMs) {
      throw new BadRequestException(
        'Attendance event capturedAt cannot be materially in the future',
      );
    }

    this.validateLocationEvidence(dto);
    await this.enforcePolicy(
      organizationId,
      dto.workLocationId,
      dto.channel,
      dto.latitude,
      dto.longitude,
    );

    const event = await this.prisma.attendanceEvent.create({
      data: {
        organizationId,
        employeeId: employee.id,
        workLocationId: workLocation?.id,
        eventType: dto.eventType,
        channel: dto.channel,
        capturedAt,
        receivedAt: now,
        syncStatus: AttendanceEventSyncStatus.RECEIVED,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationAccuracyM: dto.locationAccuracyM,
        sourceReference: this.optionalText(dto.sourceReference),
        deviceReference: this.optionalText(dto.deviceReference),
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        createdByUserId: actor.sub,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'ATTENDANCE_EVENT_CAPTURED',
      entity: 'AttendanceEvent',
      entityId: event.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        workLocationId: event.workLocationId,
        eventType: event.eventType,
        channel: event.channel,
        capturedAt: event.capturedAt.toISOString(),
        receivedAt: event.receivedAt.toISOString(),
        syncStatus: event.syncStatus,
      },
    });

    return event;
  }

  async list(organizationId: string, pageValue = '1') {
    if (
      !/^\d+$/.test(pageValue) ||
      !Number.isSafeInteger(Number(pageValue)) ||
      Number(pageValue) < 1 ||
      Number(pageValue) > 100000
    )
      throw new BadRequestException('Invalid page.');
    const page = Number(pageValue),
      pageSize = 50;
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.attendanceEvent.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
          workLocation: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async listForEmployee(organizationId: string, employeeId: string) {
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

    return this.prisma.attendanceEvent.findMany({
      where: {
        organizationId,
        employeeId,
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
      orderBy: {
        capturedAt: 'desc',
      },
      take: 250,
    });
  }

  async findOne(organizationId: string, eventId: string) {
    const event = await this.prisma.attendanceEvent.findFirst({
      where: {
        id: eventId,
        organizationId,
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
    });

    if (!event) {
      throw new NotFoundException('Attendance event not found');
    }

    return event;
  }

  private async enforcePolicy(
    organizationId: string,
    workLocationId: string | undefined,
    channel: AttendanceChannel,
    latitude?: number,
    longitude?: number,
  ) {
    const policy = workLocationId
      ? await this.prisma.attendancePolicy.findFirst({
          where: {
            organizationId,
            workLocationId,
            isActive: true,
            isDefault: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    const effectivePolicy =
      policy ??
      (await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId,
          workLocationId: null,
          isActive: true,
          isDefault: true,
        },
        orderBy: { updatedAt: 'desc' },
      }));

    // A policy is configuration, not a payroll prerequisite. During staged
    // rollout, no default policy means the event may still be captured.
    if (!effectivePolicy) {
      return;
    }

    if (!effectivePolicy.attendanceRequired) {
      throw new ForbiddenException(
        'Attendance capture is disabled by the effective attendance policy',
      );
    }

    if (!effectivePolicy.allowedChannels.includes(channel)) {
      throw new ForbiddenException(
        'This attendance channel is not allowed by the effective attendance policy',
      );
    }

    if (
      effectivePolicy.locationVerificationRequired &&
      (latitude === undefined || longitude === undefined)
    ) {
      throw new BadRequestException(
        'Location evidence is required by the effective attendance policy',
      );
    }
  }

  private validateLocationEvidence(dto: CreateAttendanceEventDto) {
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
  }

  private optionalText(value?: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }
}
