import {
  WhatsAppService,
  WhatsAppMessageRejected,
} from '../whatsapp/whatsapp.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AttendanceChannel,
  AttendanceEventType,
  AttendanceLocationVerificationStatus,
  DataScope,
  Feature,
  Permission,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from '../../common/access/access-control.service';
import { EntitlementsService } from '../../common/entitlements/entitlements.service';
import { RecurringSchedulesService } from '../recurring-schedules/recurring-schedules.service';
import { localInstant } from '../attendance-schedule-review/attendance-schedule-review.service';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
import type { CreateAttendanceEventDto } from '../attendance-events/dto/create-attendance-event.dto';
import type {
  ReviewSettingsDto,
  ReviewAttemptDto,
} from './attendance-review.controller';
export function distanceMetres(a: number, b: number, c: number, d: number) {
  const rad = Math.PI / 180,
    lat = (c - a) * rad,
    lon = (d - b) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function localDate(at: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
export function attemptDecision(mode: string, issues: string[]) {
  return !issues.length ||
    (mode === 'FLEXIBLE' && issues.every((i) => i === 'OUTSIDE_SITE'))
    ? 'CONFIRMED'
    : mode === 'STRICT' && issues.includes('OUTSIDE_SITE')
      ? 'REJECTED'
      : 'PENDING';
}
@Injectable()
export class AttendanceReviewService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger('AttendanceMonitoring');
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessControlService,
    private readonly entitlements: EntitlementsService,
    private readonly schedules: RecurringSchedulesService,
    private readonly whatsapp?: WhatsAppService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.tick().catch(() =>
          this.logger.error('ATTENDANCE_MONITOR_FAILED'),
        ),
      60000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async settings(organizationId: string) {
    return (
      (await this.prisma.attendanceReviewSettings.findUnique({
        where: { organizationId },
      })) ?? {
        organizationId,
        whatsappAlerts: false,
        enabled: false,
        locationMode: 'REVIEW',
        reminderMinutes: 5,
        supervisorMinutes: 10,
        escalationMinutes: 20,
        reviewerUserId: null,
        operationsUserId: null,
        siteRouting: [],
      }
    );
  }
  private async eligible(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, email: true, role: true, fullName: true },
    });
    const flags = await Promise.all(
      users.map(async (u) => ({
        u,
        permissions: await this.access.getEffectivePermissions({
          sub: u.id,
          email: u.email,
          role: u.role,
          organizationId,
        }),
      })),
    );
    return flags
      .filter((x) =>
        x.permissions.some(
          (p) =>
            p.permission === Permission.MANAGE_ATTENDANCE &&
            p.scope === DataScope.ORGANIZATION,
        ),
      )
      .map((x) => x.u);
  }
  async choices(actor: TenantJwtUser) {
    return {
      reviewers: await this.eligible(actor.organizationId),
      locations: await this.prisma.workLocation.findMany({
        where: { organizationId: actor.organizationId, isActive: true },
        select: { id: true, name: true },
      }),
    };
  }
  async configure(actor: TenantJwtUser, dto: ReviewSettingsDto) {
    if (dto.whatsappAlerts && !process.env.WHATSAPP_ATTENDANCE_ALERT_TEMPLATE)
      throw new BadRequestException(
        'Configure an approved WhatsApp attendance template before enabling WhatsApp alerts',
      );
    if (
      !(
        dto.reminderMinutes < dto.supervisorMinutes &&
        dto.supervisorMinutes < dto.escalationMinutes
      )
    )
      throw new BadRequestException(
        'Reminder, supervisor and escalation times must increase',
      );
    const users = await this.eligible(actor.organizationId),
      ids = new Set(users.map((u) => u.id));
    for (const id of [
      dto.reviewerUserId,
      dto.operationsUserId,
      ...(dto.siteRouting ?? []).map((r) => r.reviewerUserId),
    ])
      if (id && !ids.has(id))
        throw new BadRequestException(
          'Reviewer must be an active company user with organization-wide Manage attendance permission',
        );
    const seen = new Set<string>();
    for (const route of dto.siteRouting ?? []) {
      if (seen.has(route.workLocationId))
        throw new BadRequestException('Each site may have one routing rule');
      seen.add(route.workLocationId);
      if (
        !(await this.prisma.workLocation.findFirst({
          where: {
            id: route.workLocationId,
            organizationId: actor.organizationId,
            isActive: true,
          },
        }))
      )
        throw new BadRequestException('Site not found in your company');
    }
    const data = {
      ...dto,
      whatsappAlerts: dto.whatsappAlerts ?? false,
      reviewerUserId: dto.reviewerUserId ?? null,
      operationsUserId: dto.operationsUserId ?? null,
      siteRouting: JSON.parse(
        JSON.stringify(dto.siteRouting ?? []),
      ) as Prisma.InputJsonValue,
    };
    const result = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.attendanceReviewSettings.upsert({
        where: { organizationId: actor.organizationId },
        create: { organizationId: actor.organizationId, ...data },
        update: data,
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          entity: 'AttendanceReviewSettings',
          entityId: actor.organizationId,
          action: 'ATTENDANCE_REVIEW_CONFIGURED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          actorRole: actor.role,
          metadata: { locationMode: dto.locationMode, enabled: dto.enabled },
        },
        tx,
      );
      return saved;
    });
    return result;
  }
  private async shift(organizationId: string, employeeId: string, at: Date) {
    const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      }),
      zone = org?.timezone ?? 'Africa/Johannesburg';
    const date = localDate(at, zone),
      previous = new Date(Date.parse(date + 'T00:00:00Z') - 86400000)
        .toISOString()
        .slice(0, 10);
    const candidates = [] as Array<{
      schedule: NonNullable<
        Awaited<ReturnType<RecurringSchedulesService['effective']>>['schedule']
      >;
      start: Date;
      end: Date;
      timezone: string;
      date: string;
    }>;
    for (const day of [date, previous]) {
      const { schedule } = await this.schedules.effective(
        organizationId,
        employeeId,
        day,
      );
      if (!schedule) continue;
      const timezone = schedule.workLocation?.timezone ?? zone,
        start = localInstant(day, schedule.shift.startMinute, timezone);
      const endDay =
        schedule.shift.endMinute < schedule.shift.startMinute
          ? new Date(Date.parse(day + 'T00:00:00Z') + 86400000)
              .toISOString()
              .slice(0, 10)
          : day;
      const end = localInstant(endDay, schedule.shift.endMinute, timezone);
      if (
        at.getTime() >= start.getTime() - 4 * 3600000 &&
        at.getTime() <= end.getTime() + 8 * 3600000
      )
        candidates.push({ schedule, start, end, timezone, date: day });
    }
    candidates.sort(
      (a, b) =>
        Math.abs(at.getTime() - a.start.getTime()) -
        Math.abs(at.getTime() - b.start.getTime()),
    );
    return { shift: candidates[0] ?? null, timezone: zone };
  }
  private async recipients(
    organizationId: string,
    workLocationId?: string | null,
    operations = false,
  ) {
    const settings = await this.settings(organizationId),
      users = await this.eligible(organizationId),
      eligible = new Set(users.map((u) => u.id));
    const routing = settings.siteRouting as Array<{
      workLocationId: string;
      reviewerUserId: string;
      locationMode?: string;
    }>;
    const chosen = operations
      ? settings.operationsUserId
      : (routing.find((r) => r.workLocationId === workLocationId)
          ?.reviewerUserId ?? settings.reviewerUserId);
    return chosen && eligible.has(chosen)
      ? [chosen]
      : users.filter((u) => u.role === 'COMPANY_ADMIN').map((u) => u.id);
  }
  private async alert(
    tx: Prisma.TransactionClient,
    org: string,
    employee: string,
    recipients: string[],
    incidentKey: string,
    kind: string,
    message: string,
    shiftStart?: Date | null,
  ) {
    const configured = await tx.attendanceReviewSettings.findUnique({
      where: { organizationId: org },
      select: { whatsappAlerts: true },
    });
    for (const recipientUserId of new Set(recipients))
      await tx.attendanceAlert.upsert({
        where: {
          organizationId_recipientUserId_incidentKey: {
            organizationId: org,
            recipientUserId,
            incidentKey,
          },
        },
        create: {
          organizationId: org,
          employeeId: employee,
          recipientUserId,
          incidentKey,
          kind,
          message,
          shiftStart,
          whatsappStatus: configured?.whatsappAlerts
            ? 'QUEUED'
            : 'NOT_REQUESTED',
        },
        update: {},
      });
  }
  private async event(
    tx: Prisma.TransactionClient,
    attempt: {
      id: string;
      organizationId: string;
      employeeId: string;
      eventType: AttendanceEventType;
      channel: AttendanceChannel;
      capturedAt: Date;
      workLocationId: string | null;
      latitude: number;
      longitude: number;
      distanceM: number | null;
      reason: string;
      sourceReference: string;
      submittedByUserId: string;
    },
    actor: TenantJwtUser,
    locationId?: string,
  ) {
    const latest = await tx.attendanceEvent.findFirst({
      where: {
        organizationId: attempt.organizationId,
        employeeId: attempt.employeeId,
      },
      include: { attendanceCorrection: true },
      orderBy: { capturedAt: 'desc' },
    });
    const type =
      latest?.attendanceCorrection?.correctedEventType ?? latest?.eventType;
    if (
      type === attempt.eventType ||
      (!latest && attempt.eventType === 'CHECK_OUT')
    )
      throw new ConflictException(
        'Attendance sequence has changed. Check your attendance before retrying.',
      );
    if (latest && latest.capturedAt > attempt.capturedAt)
      throw new ConflictException(
        'A later attendance event already exists. Use an audited attendance correction instead.',
      );
    const result = await tx.attendanceEvent.create({
      data: {
        organizationId: attempt.organizationId,
        employeeId: attempt.employeeId,
        workLocationId: locationId ?? attempt.workLocationId,
        eventType: attempt.eventType,
        channel: attempt.channel,
        capturedAt: attempt.capturedAt,
        latitude: attempt.latitude,
        longitude: attempt.longitude,
        sourceReference: attempt.sourceReference,
        createdByUserId: actor.sub,
        locationVerificationStatus: attempt.reason.includes('OUTSIDE_SITE')
          ? AttendanceLocationVerificationStatus.OUTSIDE_RADIUS
          : attempt.distanceM !== null
            ? AttendanceLocationVerificationStatus.WITHIN_RADIUS
            : AttendanceLocationVerificationStatus.NOT_CONFIGURED,
        distanceFromWorkLocationM: attempt.distanceM,
        metadata: {
          attemptId: attempt.id,
          reviewed: actor.sub !== attempt.submittedByUserId,
          locationEvidence: 'SHARED_LOCATION',
        },
      },
    });
    await this.audit.log(
      {
        organizationId: attempt.organizationId,
        entity: 'AttendanceEvent',
        entityId: result.id,
        action: 'ATTENDANCE_EVENT_CAPTURED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        actorRole: actor.role,
        metadata: {
          attemptId: attempt.id,
          eventType: attempt.eventType,
          payrollEffect: 'NONE',
        },
      },
      tx,
    );
    return result;
  }
  async capture(actor: TenantJwtUser, dto: CreateAttendanceEventDto) {
    const org = actor.organizationId,
      employee = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, organizationId: org, status: 'ACTIVE' },
      });
    if (!employee) throw new NotFoundException('Active employee not found');
    if (employee.userId !== actor.sub)
      await this.access.requirePermission(actor, Permission.MANAGE_ATTENDANCE);
    if (
      !Number.isFinite(dto.latitude) ||
      !Number.isFinite(dto.longitude) ||
      Math.abs(dto.latitude!) > 90 ||
      Math.abs(dto.longitude!) > 180
    )
      throw new BadRequestException('Share a valid current location');
    const at = new Date(dto.capturedAt),
      context = await this.shift(org, employee.id, at);
    const assignment =
      await this.prisma.employeeWorkLocationAssignment.findFirst({
        where: {
          organizationId: org,
          employeeId: employee.id,
          isPrimary: true,
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
    const reassigned =
      assignment?.effectiveFrom &&
      context.shift &&
      assignment.effectiveFrom >= context.shift.start;
    const workLocationId =
      (reassigned
        ? assignment?.workLocationId
        : context.shift?.schedule.workLocationId) ??
      assignment?.workLocationId ??
      null;
    const location = workLocationId
      ? await this.prisma.workLocation.findFirst({
          where: { id: workLocationId, organizationId: org, isActive: true },
        })
      : null;
    const sitePolicy = workLocationId
      ? await this.prisma.attendancePolicy.findFirst({
          where: {
            organizationId: org,
            workLocationId,
            isDefault: true,
            isActive: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    const effectivePolicy =
      sitePolicy ??
      (await this.prisma.attendancePolicy.findFirst({
        where: {
          organizationId: org,
          workLocationId: null,
          isDefault: true,
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      }));
    if (
      effectivePolicy &&
      (!effectivePolicy.attendanceRequired ||
        !effectivePolicy.allowedChannels.includes(dto.channel))
    )
      throw new ForbiddenException(
        'Attendance is disabled or this channel is not allowed by the assigned site policy',
      );
    if (location && !location.attendanceEnabled)
      throw new ForbiddenException(
        'Attendance is disabled at the assigned work location',
      );
    const settings = await this.settings(org),
      routing = settings.siteRouting as Array<{
        workLocationId: string;
        locationMode?: string;
      }>;
    const mode =
      routing.find((r) => r.workLocationId === workLocationId)?.locationMode ??
      settings.locationMode;
    const issues: string[] = [];
    if (!location) issues.push('NO_SITE');
    if (!context.shift) issues.push('NO_SHIFT');
    let distanceM: number | null = null;
    if (
      location?.latitude != null &&
      location.longitude != null &&
      location.geofenceRadiusMeters != null &&
      location.geofenceRadiusMeters > 0
    ) {
      distanceM = distanceMetres(
        dto.latitude!,
        dto.longitude!,
        location.latitude,
        location.longitude,
      );
      if (distanceM > location.geofenceRadiusMeters)
        issues.push('OUTSIDE_SITE');
    } else issues.push('GEOFENCE_NOT_CONFIGURED');
    const lateMinutes =
      context.shift &&
      dto.eventType === 'CHECK_IN' &&
      at.getTime() >
        context.shift.start.getTime() +
          context.shift.schedule.graceInMinutes * 60000
        ? Math.ceil((at.getTime() - context.shift.start.getTime()) / 60000)
        : 0;
    const recipients = await this.recipients(org, workLocationId),
      sourceReference = dto.sourceReference ?? randomUUID();
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${org}), hashtext(${employee.id}))`;
        const existing = await tx.attendanceAttempt.findUnique({
          where: {
            organizationId_sourceReference: {
              organizationId: org,
              sourceReference,
            },
          },
        });
        if (existing) return existing;
        const status = attemptDecision(mode, issues);
        const attempt = await tx.attendanceAttempt.create({
          data: {
            organizationId: org,
            employeeId: employee.id,
            submittedByUserId: actor.sub,
            sourceReference,
            eventType: dto.eventType,
            channel: dto.channel,
            capturedAt: at,
            workLocationId,
            latitude: dto.latitude!,
            longitude: dto.longitude!,
            distanceM,
            reason: issues.join(',') || 'WITHIN_SITE',
            mode,
            status,
            lateMinutes,
            shiftStart: context.shift?.start,
            timezone: context.shift?.timezone ?? context.timezone,
          },
        });
        if (status === 'CONFIRMED') {
          const event = await this.event(tx, attempt, actor);
          await tx.attendanceAttempt.update({
            where: { id: attempt.id },
            data: { acceptedEventId: event.id },
          });
          attempt.acceptedEventId = event.id;
          await tx.attendanceAttempt.updateMany({
            where: {
              organizationId: org,
              employeeId: employee.id,
              status: 'PENDING',
              eventType: dto.eventType,
              capturedAt: { lte: at },
            },
            data: {
              status: 'SUPERSEDED',
              resolution: 'Replaced by a later confirmed attempt',
            },
          });
          if (dto.eventType === 'CHECK_IN')
            await tx.attendanceAlert.updateMany({
              where: {
                organizationId: org,
                employeeId: employee.id,
                shiftStart: context.shift?.start ?? null,
                kind: { startsWith: 'MISSING_' },
              },
              data: { resolved: true },
            });
        }
        if (issues.length || lateMinutes) {
          const message = `${employee.firstName} ${employee.lastName}: ${dto.eventType === 'CHECK_IN' ? 'clock-in' : 'clock-out'} ${status === 'CONFIRMED' ? 'recorded' : 'attempt requires attention'}. ${issues.join(', ')}${lateMinutes ? ` Late by ${lateMinutes} minutes.` : ''}`;
          await this.alert(
            tx,
            org,
            employee.id,
            recipients,
            'ATTEMPT:' + attempt.id,
            'ATTENDANCE_EXCEPTION',
            message,
            context.shift?.start,
          );
        }
        if (status === 'CONFIRMED' && issues.includes('OUTSIDE_SITE'))
          await tx.attendanceException.createMany({
            data: {
              organizationId: org,
              employeeId: employee.id,
              workLocationId,
              type: 'LOCATION_MISMATCH',
              sourceAttendanceEventId: attempt.acceptedEventId,
              note: `Shared location was ${Math.round(distanceM!)} metres from the assigned site centre. Flexible policy recorded attendance; review the location exception. No automatic payroll effect.`,
            },
            skipDuplicates: true,
          });
        if (lateMinutes && status === 'CONFIRMED')
          await tx.attendanceException.createMany({
            data: {
              organizationId: org,
              employeeId: employee.id,
              workLocationId,
              type: 'LATE_ARRIVAL',
              sourceAttendanceEventId: attempt.acceptedEventId,
              scheduledDate: new Date(context.shift!.date + 'T00:00:00Z'),
              expectedBy: context.shift!.start,
              note: `${lateMinutes} minutes after scheduled start; beyond grace. No automatic pay deduction.`,
            },
            skipDuplicates: true,
          });
        await this.audit.log(
          {
            organizationId: org,
            entity: 'AttendanceAttempt',
            entityId: attempt.id,
            action: 'ATTENDANCE_ATTEMPT_RECORDED',
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            metadata: {
              status,
              reason: attempt.reason,
              lateMinutes,
              payrollEffect: 'NONE',
            },
          },
          tx,
        );
        return attempt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { ...result, siteName: location?.name ?? null };
  }
  async attempts(actor: TenantJwtUser) {
    const rows = await this.prisma.attendanceAttempt.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { in: ['PENDING', 'REJECTED'] },
      },
      orderBy: { capturedAt: 'desc' },
      take: 200,
    });
    const employees = await this.prisma.employee.findMany({
        where: {
          organizationId: actor.organizationId,
          id: { in: rows.map((r) => r.employeeId) },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
        },
      }),
      locations = await this.prisma.workLocation.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, name: true },
      });
    return rows.map((r) => ({
      ...r,
      employee: employees.find((e) => e.id === r.employeeId),
      workLocation: locations.find((l) => l.id === r.workLocationId),
    }));
  }
  async review(actor: TenantJwtUser, id: string, dto: ReviewAttemptDto) {
    await this.access.requirePermission(actor, Permission.MANAGE_ATTENDANCE);
    if (dto.reason.trim().length < 5)
      throw new BadRequestException('A review reason is required');
    const source = await this.prisma.attendanceAttempt.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!source) throw new NotFoundException('Attempt not found');

    if (
      dto.workLocationId &&
      !(await this.prisma.workLocation.findFirst({
        where: {
          id: dto.workLocationId,
          organizationId: actor.organizationId,
          isActive: true,
        },
      }))
    )
      throw new BadRequestException('Choose an active site in your company');
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.organizationId}), hashtext(${source.employeeId}))`;
        const current = await tx.attendanceAttempt.findFirst({
          where: {
            id,
            organizationId: actor.organizationId,
            status: 'PENDING',
          },
        });
        if (!current)
          throw new ConflictException('Attempt is not awaiting review');
        let acceptedEventId: string | undefined;
        if (dto.action === 'ACCEPT') {
          const site = dto.workLocationId ?? current.workLocationId;
          if (!site)
            throw new BadRequestException(
              'Choose the authorised site before accepting attendance',
            );
          acceptedEventId = (await this.event(tx, current, actor, site)).id;
          if (current.lateMinutes && current.eventType === 'CHECK_IN')
            await tx.attendanceException.createMany({
              data: {
                organizationId: actor.organizationId,
                employeeId: current.employeeId,
                workLocationId: site,
                type: 'LATE_ARRIVAL',
                sourceAttendanceEventId: acceptedEventId,
                expectedBy: current.shiftStart,
                note: `${current.lateMinutes} minutes after scheduled start. Reviewed location; no automatic payroll deduction.`,
              },
              skipDuplicates: true,
            });
          if (
            dto.workLocationId &&
            dto.workLocationId !== current.workLocationId
          ) {
            await tx.employeeWorkLocationAssignment.updateMany({
              where: {
                organizationId: actor.organizationId,
                employeeId: current.employeeId,
                isPrimary: true,
                effectiveFrom: { lte: current.capturedAt },
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gt: current.capturedAt } },
                ],
              },
              data: {
                effectiveTo: current.capturedAt,
                endedByUserId: actor.sub,
              },
            });
            await tx.employeeWorkLocationAssignment.create({
              data: {
                organizationId: actor.organizationId,
                employeeId: current.employeeId,
                workLocationId: site,
                effectiveFrom: current.capturedAt,
                assignedByUserId: actor.sub,
              },
            });
          }
        }
        const status =
          dto.action === 'ACCEPT'
            ? 'CONFIRMED'
            : dto.action === 'REJECT'
              ? 'REJECTED'
              : 'PENDING';
        const changed = await tx.attendanceAttempt.update({
          where: { id },
          data: {
            status,
            resolution: dto.reason,
            reviewedByUserId: actor.sub,
            reviewedAt: new Date(),
            ...(acceptedEventId ? { acceptedEventId } : {}),
          },
        });
        await tx.attendanceAlert.updateMany({
          where: {
            organizationId: actor.organizationId,
            incidentKey: 'ATTEMPT:' + id,
          },
          data: { resolved: dto.action !== 'REQUEST_LOCATION' },
        });
        if (acceptedEventId && current.eventType === 'CHECK_IN')
          await tx.attendanceAlert.updateMany({
            where: {
              organizationId: actor.organizationId,
              employeeId: current.employeeId,
              shiftStart: current.shiftStart,
              kind: { startsWith: 'MISSING_' },
            },
            data: { resolved: true },
          });
        const employee = await tx.employee.findUnique({
          where: { id: current.employeeId },
        });
        if (employee?.userId)
          await this.alert(
            tx,
            actor.organizationId,
            current.employeeId,
            [employee.userId],
            `REVIEW:${id}:${dto.action}:${changed.reviewedAt!.getTime()}`,
            'ATTENDANCE_REVIEW',
            dto.action === 'REQUEST_LOCATION'
              ? 'Your supervisor requested a fresh location. Open Attendance → Clock in/out and share your current location.'
              : `Your attendance attempt was ${status === 'CONFIRMED' ? 'accepted' : 'rejected'}. ${dto.reason}`,
            current.shiftStart,
          );
        await this.audit.log(
          {
            organizationId: actor.organizationId,
            entity: 'AttendanceAttempt',
            entityId: id,
            action: 'ATTENDANCE_ATTEMPT_' + dto.action,
            actorUserId: actor.sub,
            actorEmail: actor.email,
            actorRole: actor.role,
            reason: dto.reason,
            metadata: {
              acceptedEventId: acceptedEventId ?? null,
              payrollEffect: 'NONE',
              authorisedSite: dto.workLocationId ?? null,
            },
          },
          tx,
        );
        return changed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return result;
  }
  async explain(actor: TenantJwtUser, id: string, explanation: string) {
    if (explanation.trim().length < 5 || explanation.length > 1000)
      throw new BadRequestException('Explanation must be 5–1000 characters');
    const changed = await this.prisma.attendanceAttempt.updateMany({
      where: {
        id,
        organizationId: actor.organizationId,
        submittedByUserId: actor.sub,
        status: 'PENDING',
      },
      data: { explanation: explanation.trim() },
    });
    if (!changed.count)
      throw new NotFoundException('Your pending attempt was not found');
    await this.audit.log({
      organizationId: actor.organizationId,
      entity: 'AttendanceAttempt',
      entityId: id,
      action: 'ATTENDANCE_ATTEMPT_EXPLAINED',
      actorUserId: actor.sub,
    });
    return { saved: true };
  }
  async alerts(actor: TenantJwtUser) {
    return this.prisma.attendanceAlert.findMany({
      where: {
        organizationId: actor.organizationId,
        recipientUserId: actor.sub,
        resolved: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  async readAlert(actor: TenantJwtUser, id: string) {
    await this.prisma.attendanceAlert.updateMany({
      where: {
        id,
        organizationId: actor.organizationId,
        recipientUserId: actor.sub,
      },
      data: { readAt: new Date() },
    });
    return { saved: true };
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const settings = await this.prisma.attendanceReviewSettings.findMany({
        where: { OR: [{ enabled: true }, { whatsappAlerts: true }] },
        take: 1000,
      });
      for (const s of settings) {
        const org = await this.prisma.organization.findFirst({
          where: { id: s.organizationId, status: 'ACTIVE' },
        });
        if (
          org &&
          (await this.entitlements.hasFeature(org.id, Feature.ATTENDANCE))
        ) {
          if (s.enabled) await this.monitor(org.id);
          if (s.whatsappAlerts) await this.sendQueuedAlerts(org.id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async sendQueuedAlerts(org: string) {
    if (
      !this.whatsapp ||
      !process.env.WHATSAPP_ATTENDANCE_ALERT_TEMPLATE ||
      !(await this.entitlements.hasFeature(org, Feature.WHATSAPP))
    )
      return;
    const alerts = await this.prisma.attendanceAlert.findMany({
      where: { organizationId: org, whatsappStatus: 'QUEUED', resolved: false },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    const reviewerIds = new Set((await this.eligible(org)).map((u) => u.id));
    for (const alert of alerts) {
      const claimed = await this.prisma.attendanceAlert.updateMany({
        where: { id: alert.id, organizationId: org, whatsappStatus: 'QUEUED' },
        data: { whatsappStatus: 'SENDING', whatsappClaimedAt: new Date() },
      });
      if (!claimed.count) continue;
      try {
        const receiver = await this.prisma.employee.findFirst({
          where: {
            organizationId: org,
            userId: alert.recipientUserId,
            status: 'ACTIVE',
            whatsappOptInAt: { not: null },
            whatsappNumber: { not: null },
            user: { isActive: true },
            whatsappEssIdentity: { isActive: true },
          },
        });
        if (
          !receiver ||
          alert.recipientUserId !== receiver.userId ||
          (['MISSING_EMPLOYEE', 'ATTENDANCE_REVIEW'].includes(alert.kind) &&
            receiver.id !== alert.employeeId) ||
          (alert.kind !== 'MISSING_EMPLOYEE' &&
            alert.kind !== 'ATTENDANCE_REVIEW' &&
            !reviewerIds.has(alert.recipientUserId))
        ) {
          await this.prisma.attendanceAlert.updateMany({
            where: {
              id: alert.id,
              organizationId: org,
              whatsappStatus: 'SENDING',
            },
            data: { whatsappStatus: 'SKIPPED' },
          });
          continue;
        }
        const base =
          process.env.DELUXHR_WEB_BASE_URL?.replace(/\/$/, '') ??
          'https://app.deluxhr.co.za';
        if (!base.startsWith('https://'))
          throw new Error('Secure app URL required');
        const response = await this.whatsapp.sendAttendanceAlert(
          receiver.whatsappNumber!,
          `${receiver.firstName} ${receiver.lastName}`,
          alert.message,
          base +
            (reviewerIds.has(receiver.userId!)
              ? '/attendance-exceptions'
              : '/dashboard'),
        );
        await this.prisma.attendanceAlert.updateMany({
          where: {
            id: alert.id,
            organizationId: org,
            whatsappStatus: 'SENDING',
          },
          data: {
            whatsappStatus: 'SENT',
            whatsappProviderId:
              typeof response?.messages?.[0]?.id === 'string'
                ? response.messages[0].id
                : null,
          },
        });
      } catch (error) {
        this.logger.warn('ATTENDANCE_WHATSAPP_ALERT_FAILED');
        await this.prisma.attendanceAlert.updateMany({
          where: {
            id: alert.id,
            organizationId: org,
            whatsappStatus: 'SENDING',
          },
          data: {
            whatsappStatus:
              error instanceof WhatsAppMessageRejected ? 'REJECTED' : 'UNKNOWN',
          },
        });
      }
    }
  }
  async monitor(org: string, force = false) {
    const settings = await this.settings(org);
    if (!settings.enabled && !force) return { scanned: 0 };
    const employees = await this.prisma.employee.findMany({
      where: { organizationId: org, status: 'ACTIVE' },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        employmentStartDate: true,
        employmentEndDate: true,
      },
    });
    let scanned = 0;
    for (const employee of employees) {
      const now = new Date(),
        context = await this.shift(org, employee.id, now);
      if (!context.shift) continue;
      const shift = context.shift,
        elapsed = (now.getTime() - shift.start.getTime()) / 60000;
      if (elapsed < settings.reminderMinutes || now > shift.end) continue;
      if (
        (employee.employmentStartDate &&
          employee.employmentStartDate > shift.end) ||
        (employee.employmentEndDate && employee.employmentEndDate < shift.start)
      )
        continue;
      const approvedLeave = await this.prisma.leaveRequest.findFirst({
        where: {
          organizationId: org,
          employeeId: employee.id,
          status: 'APPROVED',
          startDate: { lte: new Date(shift.date + 'T00:00:00Z') },
          endDate: { gte: new Date(shift.date + 'T00:00:00Z') },
        },
      });
      if (approvedLeave) {
        await this.prisma.attendanceAlert.updateMany({
          where: {
            organizationId: org,
            employeeId: employee.id,
            shiftStart: shift.start,
            kind: { startsWith: 'MISSING_' },
          },
          data: { resolved: true },
        });
        continue;
      }
      const event = await this.prisma.attendanceEvent.findFirst({
        where: {
          organizationId: org,
          employeeId: employee.id,
          eventType: 'CHECK_IN',
          capturedAt: {
            gte: new Date(shift.start.getTime() - 4 * 3600000),
            lte: shift.end,
          },
        },
      });
      if (event) {
        await this.prisma.attendanceAlert.updateMany({
          where: {
            organizationId: org,
            employeeId: employee.id,
            shiftStart: shift.start,
            kind: { startsWith: 'MISSING_' },
          },
          data: { resolved: true },
        });
        continue;
      }
      scanned++;
      const stages = [
        {
          minutes: settings.reminderMinutes,
          kind: 'MISSING_EMPLOYEE',
          recipients: employee.userId ? [employee.userId] : [],
        },
        {
          minutes: settings.supervisorMinutes,
          kind: 'MISSING_SUPERVISOR',
          recipients: await this.recipients(org, shift.schedule.workLocationId),
        },
        {
          minutes: settings.escalationMinutes,
          kind: 'MISSING_OPERATIONS',
          recipients: await this.recipients(
            org,
            shift.schedule.workLocationId,
            true,
          ),
        },
      ];
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${org}), hashtext(${employee.id}))`;
        if (
          await tx.leaveRequest.findFirst({
            where: {
              organizationId: org,
              employeeId: employee.id,
              status: 'APPROVED',
              startDate: { lte: new Date(shift.date + 'T00:00:00Z') },
              endDate: { gte: new Date(shift.date + 'T00:00:00Z') },
            },
          })
        )
          return;
        if (
          await tx.attendanceEvent.findFirst({
            where: {
              organizationId: org,
              employeeId: employee.id,
              eventType: 'CHECK_IN',
              capturedAt: {
                gte: new Date(shift.start.getTime() - 4 * 3600000),
                lte: shift.end,
              },
            },
          })
        )
          return;
        for (const stage of stages)
          if (elapsed >= stage.minutes)
            await this.alert(
              tx,
              org,
              employee.id,
              stage.recipients,
              `${employee.id}:${shift.start.toISOString()}:${stage.kind}`,
              stage.kind,
              `${employee.firstName} ${employee.lastName}: attendance is unconfirmed ${Math.floor(elapsed)} minutes after shift start. Check the site before determining absence or pay.`,
              shift.start,
            );
      });
    }
    return { scanned };
  }
}
