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
  AttendanceLocationVerificationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { FieldAttendanceDto } from './dto/field-attendance.dto';

@Injectable()
export class AttendanceFieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async clock(
    user: TenantJwtUser,
    dto: FieldAttendanceDto,
  ) {
    if (user.role !== UserRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Field attendance self-service is available to employee accounts only',
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
        id: dto.workLocationId,
        organizationId: user.organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException(
        'Active work location not found',
      );
    }

    if (!location.whatsappLocationEnabled) {
      throw new ForbiddenException(
        'Location-assisted field attendance is disabled for this work location',
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

    const policy = await this.requireFieldPolicy(
      user.organizationId,
      location.id,
    );

    const verification = this.verifyLocation(
      location.latitude,
      location.longitude,
      location.geofenceRadiusMeters,
      dto.latitude,
      dto.longitude,
    );

    if (
      policy.locationVerificationRequired &&
      verification.status ===
        AttendanceLocationVerificationStatus.NOT_CONFIGURED
    ) {
      throw new BadRequestException(
        'Location verification is required but this work location does not have coordinates and a geofence radius configured',
      );
    }

    const now = new Date();

    const event = await this.prisma.$transaction(
      async (tx) => {
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
            latest.eventType !==
              AttendanceEventType.CHECK_IN)
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
            channel: AttendanceChannel.WHATSAPP,
            capturedAt: now,
            receivedAt: now,
            syncStatus:
              AttendanceEventSyncStatus.RECEIVED,
            latitude: dto.latitude,
            longitude: dto.longitude,
            locationAccuracyM: dto.locationAccuracyM,
            locationVerificationStatus:
              verification.status,
            distanceFromWorkLocationM:
              verification.distanceM,
            sourceReference: 'LOCATION_ASSISTED_FIELD',
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
          ? 'FIELD_ATTENDANCE_CHECKED_IN'
          : 'FIELD_ATTENDANCE_CHECKED_OUT',
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
        eventType: event.eventType,
        locationVerificationStatus:
          event.locationVerificationStatus,
        distanceFromWorkLocationM:
          event.distanceFromWorkLocationM,
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
      locationVerification: {
        status: event.locationVerificationStatus,
        distanceFromWorkLocationM:
          event.distanceFromWorkLocationM,
        configuredRadiusM:
          location.geofenceRadiusMeters,
        requiresReview:
          event.locationVerificationStatus ===
          AttendanceLocationVerificationStatus.OUTSIDE_RADIUS,
      },
      event: {
        id: event.id,
        eventType: event.eventType,
        channel: event.channel,
        capturedAt: event.capturedAt,
      },
    };
  }

  private async requireFieldPolicy(
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
        'No active default attendance policy is configured for this field location',
      );
    }

    if (
      !policy.attendanceRequired ||
      !policy.allowedChannels.includes(
        AttendanceChannel.WHATSAPP,
      )
    ) {
      throw new ForbiddenException(
        'Location-assisted field attendance is not allowed by the effective attendance policy',
      );
    }

    return policy;
  }

  private verifyLocation(
    workLatitude: number | null,
    workLongitude: number | null,
    radiusM: number | null,
    employeeLatitude: number,
    employeeLongitude: number,
  ): {
    status: AttendanceLocationVerificationStatus;
    distanceM: number | null;
  } {
    if (
      workLatitude === null ||
      workLongitude === null ||
      radiusM === null
    ) {
      return {
        status:
          AttendanceLocationVerificationStatus.NOT_CONFIGURED,
        distanceM: null,
      };
    }

    const distanceM = this.distanceMeters(
      workLatitude,
      workLongitude,
      employeeLatitude,
      employeeLongitude,
    );

    return {
      status:
        distanceM <= radiusM
          ? AttendanceLocationVerificationStatus.WITHIN_RADIUS
          : AttendanceLocationVerificationStatus.OUTSIDE_RADIUS,
      distanceM: Math.round(distanceM * 100) / 100,
    };
  }

  private distanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const earthRadiusM = 6371000;
    const toRadians = (degrees: number) =>
      (degrees * Math.PI) / 180;

    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const deltaPhi = toRadians(lat2 - lat1);
    const deltaLambda = toRadians(lon2 - lon1);

    const a =
      Math.sin(deltaPhi / 2) *
        Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a),
      );

    return earthRadiusM * c;
  }
}
