import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AttendanceChannel,
  AttendanceEventSyncStatus,
  AttendanceEventType,
  Prisma,
} from '@prisma/client';

import { comparePassword } from '../../common/auth/password';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  OfflineAttendanceItemDto,
  SyncOfflineAttendanceDto,
} from './dto/sync-offline-attendance.dto';

type KioskContext = {
  id: string;
  organizationId: string;
  workLocationId: string;
  deviceCode: string;
};

type ResolvedEmployee = {
  id: string;
  employeeNumber: string;
};

@Injectable()
export class AttendanceOfflineSyncService {
  private static readonly MAX_CLOCK_SKEW_MS =
    5 * 60 * 1000;
  private static readonly MAX_OFFLINE_AGE_MS =
    7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async sync(dto: SyncOfflineAttendanceDto) {
    const kiosk = await this.authenticateKiosk(
      dto.deviceCode,
      dto.deviceSecret,
    );

    await this.requireOfflinePolicy(kiosk);

    const results: Array<{
      offlineEventId: string;
      status: 'SYNCED' | 'DUPLICATE' | 'REJECTED';
      attendanceEventId?: string;
      reason?: string;
    }> = [];

    // Process in captured order so an offline CHECK_IN followed by CHECK_OUT
    // preserves the sequence in which the kiosk recorded them.
    const events = [...dto.events].sort(
      (a, b) =>
        new Date(a.capturedAt).getTime() -
        new Date(b.capturedAt).getTime(),
    );

    for (const item of events) {
      try {
        const result = await this.syncOne(kiosk, item);
        results.push(result);
      } catch (error) {
        results.push({
          offlineEventId: item.offlineEventId,
          status: 'REJECTED',
          reason:
            error instanceof Error
              ? error.message
              : 'Offline attendance event was rejected',
        });
      }
    }

    const summary = {
      received: results.length,
      synced: results.filter(
        (item) => item.status === 'SYNCED',
      ).length,
      duplicates: results.filter(
        (item) => item.status === 'DUPLICATE',
      ).length,
      rejected: results.filter(
        (item) => item.status === 'REJECTED',
      ).length,
    };

    await this.auditService.log({
      organizationId: kiosk.organizationId,
      action: 'ATTENDANCE_OFFLINE_SYNC_COMPLETED',
      entity: 'AttendanceKiosk',
      entityId: kiosk.id,
      metadata: {
        deviceCode: kiosk.deviceCode,
        workLocationId: kiosk.workLocationId,
        ...summary,
      },
    });

    return {
      kioskId: kiosk.id,
      deviceCode: kiosk.deviceCode,
      syncedAt: new Date(),
      summary,
      results,
    };
  }

  private async syncOne(
    kiosk: KioskContext,
    item: OfflineAttendanceItemDto,
  ): Promise<{
    offlineEventId: string;
    status: 'SYNCED' | 'DUPLICATE';
    attendanceEventId: string;
  }> {
    const capturedAt = new Date(item.capturedAt);
    this.validateCapturedAt(capturedAt);

    const existing =
      await this.prisma.attendanceEvent.findFirst({
        where: {
          organizationId: kiosk.organizationId,
          deviceReference: kiosk.deviceCode,
          offlineEventId: item.offlineEventId,
        },
        select: { id: true },
      });

    if (existing) {
      return {
        offlineEventId: item.offlineEventId,
        status: 'DUPLICATE',
        attendanceEventId: existing.id,
      };
    }

    const employee = await this.resolveEmployee(
      kiosk,
      item,
    );

    await this.requireCurrentLocationAssignment(
      kiosk.organizationId,
      employee.id,
      kiosk.workLocationId,
    );

    const syncedAt = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
        // Re-check idempotency inside the serializable transaction.
        const duplicate =
          await tx.attendanceEvent.findFirst({
            where: {
              organizationId: kiosk.organizationId,
              deviceReference: kiosk.deviceCode,
              offlineEventId: item.offlineEventId,
            },
            select: { id: true },
          });

        if (duplicate) {
          return {
            duplicateId: duplicate.id,
            event: null,
          };
        }

        // State is evaluated at the event's captured time, not its later sync time.
        const previous =
          await tx.attendanceEvent.findFirst({
            where: {
              organizationId: kiosk.organizationId,
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
          item.eventType ===
            AttendanceEventType.CHECK_IN &&
          previous?.eventType ===
            AttendanceEventType.CHECK_IN
        ) {
          throw new BadRequestException(
            'Employee was already checked in at the captured event time',
          );
        }

        if (
          item.eventType ===
            AttendanceEventType.CHECK_OUT &&
          (!previous ||
            previous.eventType !==
              AttendanceEventType.CHECK_IN)
        ) {
          throw new BadRequestException(
            'Employee was not checked in at the captured event time',
          );
        }

        const created =
          await tx.attendanceEvent.create({
            data: {
              organizationId: kiosk.organizationId,
              employeeId: employee.id,
              workLocationId: kiosk.workLocationId,
              eventType: item.eventType,
              channel: AttendanceChannel.KIOSK,
              capturedAt,
              receivedAt: syncedAt,
              syncedAt,
              syncStatus:
                AttendanceEventSyncStatus.SYNCED_OFFLINE,
              sourceReference:
                `OFFLINE_${item.identityMethod}`,
              deviceReference: kiosk.deviceCode,
              offlineEventId: item.offlineEventId,
            },
          });

        return {
          duplicateId: null,
          event: created,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (event.duplicateId) {
      return {
        offlineEventId: item.offlineEventId,
        status: 'DUPLICATE',
        attendanceEventId: event.duplicateId,
      };
    }

    const created = event.event;
    if (!created) {
      throw new BadRequestException(
        'Offline attendance event could not be created',
      );
    }

    await this.auditService.log({
      organizationId: kiosk.organizationId,
      action:
        item.eventType === AttendanceEventType.CHECK_IN
          ? 'OFFLINE_KIOSK_ATTENDANCE_CHECKED_IN'
          : 'OFFLINE_KIOSK_ATTENDANCE_CHECKED_OUT',
      entity: 'AttendanceEvent',
      entityId: created.id,
      metadata: {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        workLocationId: kiosk.workLocationId,
        kioskId: kiosk.id,
        deviceCode: kiosk.deviceCode,
        identityMethod: item.identityMethod,
        offlineEventId: item.offlineEventId,
        capturedAt: created.capturedAt.toISOString(),
        syncedAt: created.syncedAt?.toISOString(),
        syncStatus: created.syncStatus,
      },
    });

    return {
      offlineEventId: item.offlineEventId,
      status: 'SYNCED',
      attendanceEventId: created.id,
    };
  }

  private async authenticateKiosk(
    deviceCode: string,
    deviceSecret: string,
  ): Promise<KioskContext> {
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
      !kiosk.workLocation.kioskEnabled ||
      !kiosk.workLocation.offlineKioskEnabled
    ) {
      throw new ForbiddenException(
        'Offline kiosk attendance is disabled for this work location',
      );
    }

    await this.prisma.attendanceKiosk.update({
      where: { id: kiosk.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      id: kiosk.id,
      organizationId: kiosk.organizationId,
      workLocationId: kiosk.workLocationId,
      deviceCode: kiosk.deviceCode,
    };
  }

  private async requireOfflinePolicy(
    kiosk: KioskContext,
  ) {
    const locationPolicy =
      await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId: kiosk.organizationId,
          workLocationId: kiosk.workLocationId,
          isActive: true,
          isDefault: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

    const policy =
      locationPolicy ??
      (await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId: kiosk.organizationId,
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

  private async resolveEmployee(
    kiosk: KioskContext,
    item: OfflineAttendanceItemDto,
  ): Promise<ResolvedEmployee> {
    if (item.identityMethod === 'QR') {
      const identity =
        await this.prisma.employeeAttendanceIdentity.findFirst({
          where: {
            organizationId: kiosk.organizationId,
            qrToken: item.identityReference,
            qrEnabled: true,
            isActive: true,
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
              },
            },
          },
        });

      if (!identity) {
        throw new UnauthorizedException(
          'Offline QR identity is no longer valid',
        );
      }

      return identity.employee;
    }

    if (item.identityMethod === 'PIN') {
      // The kiosk must authenticate the PIN locally while offline using a
      // previously provisioned local credential cache. The server never accepts
      // or stores the plaintext PIN in the offline queue. At sync time we resolve
      // only the employee number and verify that the server-side identity remains
      // active and PIN-enabled.
      const employee = await this.prisma.employee.findFirst({
        where: {
          organizationId: kiosk.organizationId,
          employeeNumber: item.identityReference,
          attendanceIdentity: {
            is: {
              isActive: true,
              pinEnabled: true,
              pinHash: { not: null },
            },
          },
        },
        select: {
          id: true,
          employeeNumber: true,
        },
      });

      if (!employee) {
        throw new UnauthorizedException(
          'Offline PIN identity is no longer valid',
        );
      }

      return employee;
    }

    throw new BadRequestException(
      'Unsupported offline identity method',
    );
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

  private validateCapturedAt(capturedAt: Date) {
    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException(
        'Invalid capturedAt timestamp',
      );
    }

    const now = Date.now();

    if (
      capturedAt.getTime() >
      now +
        AttendanceOfflineSyncService.MAX_CLOCK_SKEW_MS
    ) {
      throw new BadRequestException(
        'Offline event capturedAt is too far in the future',
      );
    }

    if (
      capturedAt.getTime() <
      now -
        AttendanceOfflineSyncService.MAX_OFFLINE_AGE_MS
    ) {
      throw new BadRequestException(
        'Offline event is older than the supported seven-day synchronization window',
      );
    }
  }
}
