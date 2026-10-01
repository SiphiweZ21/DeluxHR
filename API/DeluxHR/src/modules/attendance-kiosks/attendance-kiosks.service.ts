import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AttendanceChannel,
  AttendanceEventSyncStatus,
  AttendanceEventType,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  hashPassword,
  comparePassword,
} from '../../common/auth/password';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';

import { CreateAttendanceKioskDto } from './dto/create-attendance-kiosk.dto';
import { KioskQrAttendanceDto } from './dto/kiosk-qr-attendance.dto';
import { KioskPinAttendanceDto } from './dto/kiosk-pin-attendance.dto';

@Injectable()
export class AttendanceKiosksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateAttendanceKioskDto,
    actor: TenantJwtUser,
  ) {
    const location = await this.prisma.workLocation.findFirst({
      where: {
        id: dto.workLocationId,
        organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException(
        'Active work location not found',
      );
    }

    if (!location.kioskEnabled) {
      throw new BadRequestException(
        'Kiosk attendance is not enabled for this work location',
      );
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Kiosk name is required');
    }

    const deviceCode = `KSK-${randomBytes(6)
      .toString('hex')
      .toUpperCase()}`;
    const deviceSecret = randomBytes(32).toString('base64url');
    const secretHash = await hashPassword(deviceSecret);

    const kiosk = await this.prisma.attendanceKiosk.create({
      data: {
        organizationId,
        workLocationId: location.id,
        name,
        deviceCode,
        secretHash,
        createdByUserId: actor.sub,
        updatedByUserId: actor.sub,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'ATTENDANCE_KIOSK_CREATED',
      entity: 'AttendanceKiosk',
      entityId: kiosk.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        workLocationId: location.id,
        deviceCode,
        name,
      },
    });

    return {
      ...this.safeKiosk(kiosk),
      deviceSecret,
      secretNotice:
        'Store this device secret securely. It is shown only when created or rotated.',
    };
  }

  async list(organizationId: string) {
    const kiosks = await this.prisma.attendanceKiosk.findMany({
      where: { organizationId },
      include: {
        workLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    });

    return kiosks.map(({ secretHash, ...kiosk }) => kiosk);
  }

  async rotateSecret(
    organizationId: string,
    kioskId: string,
    actor: TenantJwtUser,
  ) {
    const kiosk = await this.requireKiosk(
      organizationId,
      kioskId,
    );

    const deviceSecret = randomBytes(32).toString('base64url');
    const secretHash = await hashPassword(deviceSecret);

    const updated = await this.prisma.attendanceKiosk.update({
      where: { id: kiosk.id },
      data: {
        secretHash,
        updatedByUserId: actor.sub,
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'ATTENDANCE_KIOSK_SECRET_ROTATED',
      entity: 'AttendanceKiosk',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        deviceCode: updated.deviceCode,
      },
    });

    return {
      ...this.safeKiosk(updated),
      deviceSecret,
      secretNotice:
        'Replace the previous device secret. It is shown only now.',
    };
  }

  async setActive(
    organizationId: string,
    kioskId: string,
    isActive: boolean,
    actor: TenantJwtUser,
  ) {
    const kiosk = await this.requireKiosk(
      organizationId,
      kioskId,
    );

    const updated = await this.prisma.attendanceKiosk.update({
      where: { id: kiosk.id },
      data: {
        isActive,
        updatedByUserId: actor.sub,
      },
    });

    await this.auditService.log({
      organizationId,
      action: isActive
        ? 'ATTENDANCE_KIOSK_ACTIVATED'
        : 'ATTENDANCE_KIOSK_DEACTIVATED',
      entity: 'AttendanceKiosk',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        deviceCode: updated.deviceCode,
      },
    });

    return this.safeKiosk(updated);
  }

  async clockByQr(dto: KioskQrAttendanceDto) {
    const kiosk = await this.authenticateKiosk(
      dto.deviceCode,
      dto.deviceSecret,
    );

    const identity =
      await this.prisma.employeeAttendanceIdentity.findFirst({
        where: {
          organizationId: kiosk.organizationId,
          qrToken: dto.qrToken,
          qrEnabled: true,
          isActive: true,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

    if (!identity) {
      throw new UnauthorizedException(
        'Invalid attendance QR identity',
      );
    }

    await this.requireCurrentLocationAssignment(
      kiosk.organizationId,
      identity.employeeId,
      kiosk.workLocationId,
    );

    return this.recordKioskEvent(
      kiosk,
      identity.employee,
      dto.eventType,
      'QR',
    );
  }

  async clockByPin(dto: KioskPinAttendanceDto) {
    const kiosk = await this.authenticateKiosk(
      dto.deviceCode,
      dto.deviceSecret,
    );

    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: kiosk.organizationId,
        employeeNumber: dto.employeeNumber,
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        attendanceIdentity: true,
      },
    });

    if (
      !employee ||
      !employee.attendanceIdentity ||
      !employee.attendanceIdentity.isActive ||
      !employee.attendanceIdentity.pinEnabled ||
      !employee.attendanceIdentity.pinHash
    ) {
      throw new UnauthorizedException(
        'Invalid employee number or attendance PIN',
      );
    }

    const identity = employee.attendanceIdentity;
    const now = new Date();

    if (
      identity.pinLockedUntil &&
      identity.pinLockedUntil > now
    ) {
      throw new ForbiddenException(
        'Attendance PIN is temporarily locked',
      );
    }

    const pinHash = identity.pinHash;

    if (!pinHash) {
      throw new UnauthorizedException(
        'Invalid employee number or attendance PIN',
      );
    }

    const valid = await comparePassword(
      dto.pin,
      pinHash,
    );

    if (!valid) {
      const attempts = identity.pinFailedAttempts + 1;
      const lock = attempts >= 5;

      await this.prisma.employeeAttendanceIdentity.update({
        where: { id: identity.id },
        data: {
          pinFailedAttempts: lock ? 0 : attempts,
          pinLockedUntil: lock
            ? new Date(now.getTime() + 15 * 60 * 1000)
            : null,
        },
      });

      throw new UnauthorizedException(
        lock
          ? 'Attendance PIN is temporarily locked after repeated failed attempts'
          : 'Invalid employee number or attendance PIN',
      );
    }

    await this.prisma.employeeAttendanceIdentity.update({
      where: { id: identity.id },
      data: {
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });

    await this.requireCurrentLocationAssignment(
      kiosk.organizationId,
      employee.id,
      kiosk.workLocationId,
    );

    return this.recordKioskEvent(
      kiosk,
      employee,
      dto.eventType,
      'PIN',
    );
  }

  private async authenticateKiosk(
    deviceCode: string,
    deviceSecret: string,
  ) {
    const kiosk = await this.prisma.attendanceKiosk.findFirst({
      where: {
        deviceCode: deviceCode.trim(),
        isActive: true,
      },
      include: {
        workLocation: true,
      },
    });

    if (
      !kiosk ||
      !(await comparePassword(
        deviceSecret,
        kiosk.secretHash,
      ))
    ) {
      throw new UnauthorizedException(
        'Invalid kiosk credentials',
      );
    }

    if (
      !kiosk.workLocation.isActive ||
      !kiosk.workLocation.kioskEnabled
    ) {
      throw new ForbiddenException(
        'Kiosk attendance is disabled for this work location',
      );
    }

    await this.prisma.attendanceKiosk.update({
      where: { id: kiosk.id },
      data: { lastSeenAt: new Date() },
    });

    return kiosk;
  }

  private async requireCurrentLocationAssignment(
    organizationId: string,
    employeeId: string,
    workLocationId: string,
  ) {
    const assignment =
      await this.prisma.employeeWorkLocationAssignment.findFirst({
        where: {
          organizationId,
          employeeId,
          workLocationId,
          effectiveTo: null,
        },
      });

    if (!assignment) {
      throw new ForbiddenException(
        'Employee is not currently assigned to this kiosk work location',
      );
    }
  }

  private async recordKioskEvent(
    kiosk: {
      id: string;
      organizationId: string;
      workLocationId: string;
      deviceCode: string;
    },
    employee: {
      id: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
    },
    eventType: AttendanceEventType,
    identityMethod: 'QR' | 'PIN',
  ) {
    await this.requireKioskPolicy(
      kiosk.organizationId,
      kiosk.workLocationId,
    );

    const now = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.attendanceEvent.findFirst({
          where: {
            organizationId: kiosk.organizationId,
            employeeId: employee.id,
          },
          orderBy: [
            { capturedAt: 'desc' },
            { createdAt: 'desc' },
          ],
        });

        if (
          eventType === AttendanceEventType.CHECK_IN &&
          latest?.eventType === AttendanceEventType.CHECK_IN
        ) {
          throw new ConflictException(
            'Employee is already checked in',
          );
        }

        if (
          eventType === AttendanceEventType.CHECK_OUT &&
          (!latest ||
            latest.eventType !==
              AttendanceEventType.CHECK_IN)
        ) {
          throw new ConflictException(
            'Employee is not currently checked in',
          );
        }

        return tx.attendanceEvent.create({
          data: {
            organizationId: kiosk.organizationId,
            employeeId: employee.id,
            workLocationId: kiosk.workLocationId,
            eventType,
            channel: AttendanceChannel.KIOSK,
            capturedAt: now,
            receivedAt: now,
            syncStatus:
              AttendanceEventSyncStatus.RECEIVED,
            sourceReference: identityMethod,
            deviceReference: kiosk.deviceCode,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.auditService.log({
      organizationId: kiosk.organizationId,
      action:
        eventType === AttendanceEventType.CHECK_IN
          ? 'KIOSK_ATTENDANCE_CHECKED_IN'
          : 'KIOSK_ATTENDANCE_CHECKED_OUT',
      entity: 'AttendanceEvent',
      entityId: event.id,
      metadata: {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        workLocationId: kiosk.workLocationId,
        kioskId: kiosk.id,
        deviceCode: kiosk.deviceCode,
        identityMethod,
        eventType,
      },
    });

    return {
      status:
        eventType === AttendanceEventType.CHECK_IN
          ? 'CHECKED_IN'
          : 'CHECKED_OUT',
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        displayName:
          `${employee.firstName} ${employee.lastName}`.trim(),
      },
      event: {
        id: event.id,
        eventType: event.eventType,
        capturedAt: event.capturedAt,
        workLocationId: event.workLocationId,
      },
    };
  }

  private async requireKioskPolicy(
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
        'No active default attendance policy is configured for this kiosk',
      );
    }

    if (
      !policy.attendanceRequired ||
      !policy.allowedChannels.includes(
        AttendanceChannel.KIOSK,
      )
    ) {
      throw new ForbiddenException(
        'Kiosk attendance is not allowed by the effective attendance policy',
      );
    }
  }

  private async requireKiosk(
    organizationId: string,
    kioskId: string,
  ) {
    const kiosk = await this.prisma.attendanceKiosk.findFirst({
      where: {
        id: kioskId,
        organizationId,
      },
    });

    if (!kiosk) {
      throw new NotFoundException('Attendance kiosk not found');
    }

    return kiosk;
  }

  private safeKiosk<T extends { secretHash: string }>(
    kiosk: T,
  ): Omit<T, 'secretHash'> {
    const { secretHash, ...safe } = kiosk;
    return safe;
  }
}
