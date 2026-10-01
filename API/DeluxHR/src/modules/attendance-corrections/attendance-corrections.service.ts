import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceExceptionStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import { CreateAttendanceCorrectionDto } from './dto/create-attendance-correction.dto';
import { ResolveAttendanceExceptionDto } from './dto/resolve-attendance-exception.dto';

@Injectable()
export class AttendanceCorrectionsService {
  private static readonly MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async correctEvent(
    user: TenantJwtUser,
    eventId: string,
    dto: CreateAttendanceCorrectionDto,
  ) {
    const source = await this.prisma.attendanceEvent.findFirst({
      where: {
        id: eventId,
        organizationId: user.organizationId,
      },
      include: {
        attendanceCorrection: true,
      },
    });

    if (!source) {
      throw new NotFoundException('Attendance event not found');
    }

    if (source.attendanceCorrection) {
      throw new ConflictException(
        'This attendance event already has a correction. Historical corrections are immutable.',
      );
    }

    const correctedCapturedAt = new Date(dto.correctedCapturedAt);
    if (Number.isNaN(correctedCapturedAt.getTime())) {
      throw new BadRequestException('Invalid correctedCapturedAt timestamp');
    }

    if (
      correctedCapturedAt.getTime() >
      Date.now() + AttendanceCorrectionsService.MAX_FUTURE_SKEW_MS
    ) {
      throw new BadRequestException(
        'Corrected attendance time cannot be more than five minutes in the future',
      );
    }

    const correctedWorkLocationId =
      dto.correctedWorkLocationId ?? source.workLocationId;

    if (correctedWorkLocationId) {
      const location = await this.prisma.workLocation.findFirst({
        where: {
          id: correctedWorkLocationId,
          organizationId: user.organizationId,
        },
        select: { id: true },
      });

      if (!location) {
        throw new NotFoundException('Corrected work location not found');
      }
    }

    const correction = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.attendanceCorrection.create({
          data: {
            organizationId: user.organizationId,
            employeeId: source.employeeId,
            sourceAttendanceEventId: source.id,
            correctedEventType: dto.correctedEventType,
            correctedCapturedAt,
            correctedWorkLocationId,
            reason: dto.reason.trim(),
            note: dto.note?.trim() || null,
            correctedByUserId: user.sub,
          },
        });

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.auditService.log({
      organizationId: user.organizationId,
      action: 'ATTENDANCE_EVENT_CORRECTED',
      entity: 'AttendanceCorrection',
      entityId: correction.id,
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      reason: dto.reason.trim(),
      metadata: {
        employeeId: source.employeeId,
        sourceAttendanceEventId: source.id,
        original: {
          eventType: source.eventType,
          capturedAt: source.capturedAt.toISOString(),
          workLocationId: source.workLocationId,
          channel: source.channel,
        },
        corrected: {
          eventType: correction.correctedEventType,
          capturedAt: correction.correctedCapturedAt.toISOString(),
          workLocationId: correction.correctedWorkLocationId,
        },
        payrollEffect: 'NONE',
      },
    });

    return {
      correction,
      originalEvent: {
        id: source.id,
        eventType: source.eventType,
        capturedAt: source.capturedAt,
        workLocationId: source.workLocationId,
        channel: source.channel,
      },
      notice:
        'The original attendance event remains immutable. The correction becomes the effective presentation value and has no automatic payroll effect.',
    };
  }

  async getCorrection(
    organizationId: string,
    eventId: string,
  ) {
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: {
        organizationId,
        sourceAttendanceEventId: eventId,
      },
      include: {
        correctedWorkLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        sourceAttendanceEvent: {
          select: {
            id: true,
            employeeId: true,
            workLocationId: true,
            eventType: true,
            channel: true,
            capturedAt: true,
            receivedAt: true,
            syncedAt: true,
            syncStatus: true,
            locationVerificationStatus: true,
            distanceFromWorkLocationM: true,
            sourceReference: true,
            deviceReference: true,
            createdByUserId: true,
          },
        },
      },
    });

    if (!correction) {
      throw new NotFoundException('Attendance correction not found');
    }

    return correction;
  }

  async resolveException(
    user: TenantJwtUser,
    exceptionId: string,
    dto: ResolveAttendanceExceptionDto,
  ) {
    if (dto.status === AttendanceExceptionStatus.OPEN) {
      throw new BadRequestException(
        'Resolution status must be RESOLVED or DISMISSED',
      );
    }

    const exception = await this.prisma.attendanceException.findFirst({
      where: {
        id: exceptionId,
        organizationId: user.organizationId,
      },
    });

    if (!exception) {
      throw new NotFoundException('Attendance exception not found');
    }

    if (exception.status !== AttendanceExceptionStatus.OPEN) {
      throw new ConflictException(
        'Attendance exception has already been reviewed',
      );
    }

    const changed = await this.prisma.attendanceException.updateMany({
      where: { id: exception.id, organizationId: user.organizationId, status: AttendanceExceptionStatus.OPEN },
      data: {
        status: dto.status,
        resolvedAt: new Date(),
        resolvedByUserId: user.sub,
        resolutionNote: dto.resolutionNote.trim(),
      },
    });

    if (!changed.count) throw new ConflictException('Attendance exception has already been reviewed');
    const updated = await this.prisma.attendanceException.findUniqueOrThrow({ where: { id: exception.id } });

    await this.auditService.log({
      organizationId: user.organizationId,
      action:
        dto.status === AttendanceExceptionStatus.RESOLVED
          ? 'ATTENDANCE_EXCEPTION_RESOLVED'
          : 'ATTENDANCE_EXCEPTION_DISMISSED',
      entity: 'AttendanceException',
      entityId: updated.id,
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      reason: dto.resolutionNote.trim(),
      metadata: {
        employeeId: updated.employeeId,
        type: updated.type,
        sourceAttendanceEventId: updated.sourceAttendanceEventId,
        status: updated.status,
        payrollEffect: 'NONE',
      },
    });

    return updated;
  }
}
