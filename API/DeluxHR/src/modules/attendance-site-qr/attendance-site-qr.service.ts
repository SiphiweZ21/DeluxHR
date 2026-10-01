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
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { SiteQrAttendanceDto } from './dto/site-qr-attendance.dto';

@Injectable()
export class AttendanceSiteQrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async provision(
    organizationId: string,
    workLocationId: string,
    actor: TenantJwtUser,
  ) {
    const location = await this.requireLocation(
      organizationId,
      workLocationId,
    );

    if (!location.qrEnabled) {
      throw new BadRequestException(
        'QR attendance is not enabled for this work location',
      );
    }

    if (location.siteQrToken) {
      return this.safeSiteQr(location);
    }

    const updated = await this.prisma.workLocation.update({
      where: { id: location.id },
      data: {
        siteQrToken: this.generateSiteToken(),
        siteQrRotatedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'ATTENDANCE_SITE_QR_PROVISIONED',
      entity: 'WorkLocation',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        workLocationId: updated.id,
        code: updated.code,
      },
    });

    return this.safeSiteQr(updated);
  }

  async rotate(
    organizationId: string,
    workLocationId: string,
    actor: TenantJwtUser,
  ) {
    const location = await this.requireLocation(
      organizationId,
      workLocationId,
    );

    if (!location.qrEnabled) {
      throw new BadRequestException(
        'QR attendance is not enabled for this work location',
      );
    }

    const updated = await this.prisma.workLocation.update({
      where: { id: location.id },
      data: {
        siteQrToken: this.generateSiteToken(),
        siteQrRotatedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId,
      action: 'ATTENDANCE_SITE_QR_ROTATED',
      entity: 'WorkLocation',
      entityId: updated.id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      metadata: {
        workLocationId: updated.id,
        code: updated.code,
      },
    });

    return this.safeSiteQr(updated);
  }

  async clock(
    user: TenantJwtUser,
    dto: SiteQrAttendanceDto,
  ) {
    if (user.role !== UserRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Site QR self-service attendance is available to employee accounts only',
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

    const location = await this.prisma.workLocation.findFirst({
      where: {
        organizationId: user.organizationId,
        siteQrToken: dto.siteQrToken,
        isActive: true,
        qrEnabled: true,
      },
    });

    if (!location) {
      throw new NotFoundException(
        'Invalid or inactive site QR',
      );
    }

    const assignment =
      await this.prisma.employeeWorkLocationAssignment.findFirst({
        where: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          workLocationId: location.id,
          effectiveTo: null,
        },
      });

    if (!assignment) {
      throw new ForbiddenException(
        'Employee is not currently assigned to this work location',
      );
    }

    this.validateLocationEvidence(dto);
    await this.requireQrPolicy(
      user.organizationId,
      location.id,
      dto,
    );

    const now = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
        // Open/closed state is employee-wide, not channel-specific.
        // An employee who checked in on WEB cannot check in again by QR.
        const latest = await tx.attendanceEvent.findFirst({
          where: {
            organizationId: user.organizationId,
            employeeId: employee.id,
          },
          orderBy: [
            { capturedAt: 'desc' },
            { createdAt: 'desc' },
          ],
        });

        if (
          dto.eventType === AttendanceEventType.CHECK_IN &&
          latest?.eventType === AttendanceEventType.CHECK_IN
        ) {
          throw new ConflictException(
            'Employee is already checked in',
          );
        }

        if (
          dto.eventType === AttendanceEventType.CHECK_OUT &&
          (!latest ||
            latest.eventType !== AttendanceEventType.CHECK_IN)
        ) {
          throw new ConflictException(
            'Employee is not currently checked in',
          );
        }

        return tx.attendanceEvent.create({
          data: {
            organizationId: user.organizationId,
            employeeId: employee.id,
            workLocationId: location.id,
            eventType: dto.eventType,
            channel: AttendanceChannel.QR,
            capturedAt: now,
            receivedAt: now,
            syncStatus:
              AttendanceEventSyncStatus.RECEIVED,
            latitude: dto.latitude,
            longitude: dto.longitude,
            locationAccuracyM: dto.locationAccuracyM,
            sourceReference: 'SITE_QR',
            createdByUserId: user.sub,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.auditService.log({
      organizationId: user.organizationId,
      action:
        event.eventType === AttendanceEventType.CHECK_IN
          ? 'SITE_QR_ATTENDANCE_CHECKED_IN'
          : 'SITE_QR_ATTENDANCE_CHECKED_OUT',
      entity: 'AttendanceEvent',
      entityId: event.id,
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        workLocationId: location.id,
        workLocationCode: location.code,
        channel: AttendanceChannel.QR,
        eventType: event.eventType,
      },
    });

    return {
      status:
        event.eventType === AttendanceEventType.CHECK_IN
          ? 'CHECKED_IN'
          : 'CHECKED_OUT',
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        displayName:
          `${employee.firstName} ${employee.lastName}`.trim(),
      },
      workLocation: {
        id: location.id,
        code: location.code,
        name: location.name,
        type: location.type,
      },
      event: {
        id: event.id,
        eventType: event.eventType,
        channel: event.channel,
        capturedAt: event.capturedAt,
      },
    };
  }

  private async requireLocation(
    organizationId: string,
    workLocationId: string,
  ) {
    const location = await this.prisma.workLocation.findFirst({
      where: {
        id: workLocationId,
        organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException(
        'Active work location not found',
      );
    }

    return location;
  }

  private async requireQrPolicy(
    organizationId: string,
    workLocationId: string,
    dto: SiteQrAttendanceDto,
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
        'No active default attendance policy is configured for this site',
      );
    }

    if (
      !policy.attendanceRequired ||
      !policy.allowedChannels.includes(
        AttendanceChannel.QR,
      )
    ) {
      throw new ForbiddenException(
        'Site QR attendance is not allowed by the effective attendance policy',
      );
    }

    if (
      policy.locationVerificationRequired &&
      (dto.latitude === undefined ||
        dto.longitude === undefined)
    ) {
      throw new BadRequestException(
        'Location evidence is required by the effective attendance policy',
      );
    }
  }

  private validateLocationEvidence(
    dto: SiteQrAttendanceDto,
  ) {
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

  private generateSiteToken(): string {
    return `dhr_site_${randomBytes(24).toString('base64url')}`;
  }

  private safeSiteQr(location: {
    id: string;
    code: string;
    name: string;
    type: unknown;
    siteQrToken: string | null;
    siteQrRotatedAt: Date | null;
  }) {
    return {
      workLocation: {
        id: location.id,
        code: location.code,
        name: location.name,
        type: location.type,
      },
      siteQrToken: location.siteQrToken,
      siteQrRotatedAt: location.siteQrRotatedAt,
      qrPayload: location.siteQrToken,
      notice:
        'Encode qrPayload into the printed site QR. Rotate it if the displayed QR is compromised.',
    };
  }
}
