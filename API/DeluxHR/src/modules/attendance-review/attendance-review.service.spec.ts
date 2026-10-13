import {
  AttendanceReviewService,
  attemptDecision,
  distanceMetres,
  localDate,
} from './attendance-review.service';
import {
  AttendanceEventType,
  AttendanceChannel,
  DataScope,
  Permission,
} from '@prisma/client';
const actor: any = {
  sub: 'employee-login',
  organizationId: 'org',
  role: 'EMPLOYEE',
  email: 'employee@example.com',
};
function fixture(mode = 'REVIEW', outside = false) {
  const attempts: any[] = [];
  const capturedAt = new Date('2026-10-12T05:12:00Z');
  const tx: any = {
    employee: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'employee',
          userId: 'employee-login',
          firstName: 'Test',
          lastName: 'Account',
        }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'employee', userId: 'employee-login' }),
    },
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ timezone: 'Africa/Johannesburg' }),
    },
    employeeWorkLocationAssignment: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          workLocationId: 'site',
          effectiveFrom: new Date('2026-01-01'),
        }),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    workLocation: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'site',
          isActive: true,
          attendanceEnabled: true,
          latitude: 0,
          longitude: 0,
          geofenceRadiusMeters: 100,
        }),
    },
    attendancePolicy: { findFirst: jest.fn().mockResolvedValue(null) },
    attendanceReviewSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          locationMode: mode,
          siteRouting: [],
          enabled: true,
          reminderMinutes: 5,
          supervisorMinutes: 10,
          escalationMinutes: 20,
          reviewerUserId: null,
          operationsUserId: null,
        }),
    },
    attendanceAttempt: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(
        async ({ where }) =>
          attempts.find(
            (a) =>
              a.id === where.id && (!where.status || a.status === where.status),
          ) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const row = { id: 'attempt', ...data, acceptedEventId: null };
        attempts.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(
          attempts.find((a) => a.id === where.id),
          data,
        ),
      ),
      updateMany: jest.fn(),
    },
    attendanceEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'event', ...data })),
    },
    attendanceAlert: { upsert: jest.fn(), updateMany: jest.fn() },
    attendanceException: { createMany: jest.fn() },
    leaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    $executeRaw: jest.fn(),
  };
  tx.$transaction = jest.fn(async (fn) => fn(tx));
  const audit = { log: jest.fn() },
    access = {
      requirePermission: jest.fn(),
      getEffectivePermissions: jest
        .fn()
        .mockResolvedValue([
          {
            permission: Permission.MANAGE_ATTENDANCE,
            scope: DataScope.ORGANIZATION,
          },
        ]),
    };
  const schedules = { effective: jest.fn() };
  const service: any = new AttendanceReviewService(
    tx,
    audit as any,
    access as any,
    { hasFeature: jest.fn().mockResolvedValue(true) } as any,
    schedules as any,
  );
  const shift = {
    start: new Date('2026-10-12T05:00:00Z'),
    end: new Date('2026-10-12T17:00:00Z'),
    timezone: 'Africa/Johannesburg',
    date: '2026-10-12',
    schedule: { workLocationId: 'site', graceInMinutes: 5 },
  };
  service.shift = jest
    .fn()
    .mockResolvedValue({ shift, timezone: 'Africa/Johannesburg' });
  service.recipients = jest.fn().mockResolvedValue(['reviewer']);
  const dto: any = {
    employeeId: 'employee',
    eventType: AttendanceEventType.CHECK_IN,
    channel: AttendanceChannel.WHATSAPP,
    capturedAt: capturedAt.toISOString(),
    latitude: outside ? 0.01 : 0,
    longitude: 0,
    sourceReference: 'message',
  };
  return { tx, service, audit, access, schedules, dto, attempts, shift };
}
describe('Attendance review and notifications', () => {
  it('calculates geofence distance in metres', () => {
    expect(distanceMetres(0, 0, 0, 0)).toBe(0);
    expect(distanceMetres(0, 0, 0.001, 0)).toBeCloseTo(111.195, 1);
  });
  it.each([
    ['REVIEW', 'PENDING'],
    ['STRICT', 'REJECTED'],
    ['FLEXIBLE', 'CONFIRMED'],
  ])('applies %s policy outside the site', async (mode, status) => {
    const x = fixture(mode, true);
    const result = await x.service.capture(actor, x.dto);
    expect(result.status).toBe(status);
    expect(result.reason).toContain('OUTSIDE_SITE');
    expect(x.tx.attendanceEvent.create).toHaveBeenCalledTimes(
      status === 'CONFIRMED' ? 1 : 0,
    );
    expect(x.tx.attendanceAlert.upsert).toHaveBeenCalled();
  });
  it('records a valid late arrival, creates a late exception and queues the supervisor alert', async () => {
    const x = fixture();
    const result = await x.service.capture(actor, x.dto);
    expect(result.status).toBe('CONFIRMED');
    expect(result.lateMinutes).toBe(12);
    expect(x.tx.attendanceEvent.create).toHaveBeenCalledTimes(1);
    expect(x.tx.attendanceException.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'LATE_ARRIVAL' }),
        skipDuplicates: true,
      }),
    );
    expect(x.audit.log.mock.calls[0][1]).toBe(x.tx);
  });
  it('does not flag arrivals within the grace period', async () => {
    const x = fixture();
    x.dto.capturedAt = '2026-10-12T05:04:00Z';
    expect((await x.service.capture(actor, x.dto)).lateMinutes).toBe(0);
    expect(x.tx.attendanceException.createMany).not.toHaveBeenCalled();
  });
  it('keeps missing shifts out of worked time even in flexible mode', async () => {
    const x = fixture('FLEXIBLE');
    x.service.shift.mockResolvedValue({
      shift: null,
      timezone: 'Africa/Johannesburg',
    });
    expect((await x.service.capture(actor, x.dto)).status).toBe('PENDING');
    expect(x.tx.attendanceEvent.create).not.toHaveBeenCalled();
  });
  it('does not silently accept an unconfigured geofence', async () => {
    const x = fixture('FLEXIBLE');
    x.tx.workLocation.findFirst.mockResolvedValue({
      attendanceEnabled: true,
      isActive: true,
    });
    expect((await x.service.capture(actor, x.dto)).reason).toContain(
      'GEOFENCE_NOT_CONFIGURED',
    );
    expect(x.tx.attendanceEvent.create).not.toHaveBeenCalled();
  });
  it('preserves the recorded attempt across a replay without creating another event', async () => {
    const x = fixture();
    const first = await x.service.capture(actor, x.dto);
    x.tx.attendanceAttempt.findUnique.mockResolvedValue(first);
    await x.service.capture(actor, x.dto);
    expect(x.tx.attendanceEvent.create).toHaveBeenCalledTimes(1);
  });
  it('rejects duplicate attendance sequences', async () => {
    const x = fixture();
    x.tx.attendanceEvent.findFirst.mockResolvedValue({
      capturedAt: new Date('2026-10-12T05:00Z'),
      eventType: 'CHECK_IN',
    });
    await expect(x.service.capture(actor, x.dto)).rejects.toThrow(
      'sequence has changed',
    );
  });
  it('allows authorised review of an own attempt', async () => {
    const x = fixture('REVIEW', true);
    await x.service.capture(actor, x.dto);
    await expect(
      x.service.review(actor, 'attempt', {
        action: 'ACCEPT',
        reason: 'Valid reassignment',
      }),
    ).resolves.toMatchObject({status:'CONFIRMED'});
  });
  it('accepts a pending attempt only through another authorised reviewer', async () => {
    const x = fixture('REVIEW', true);
    await x.service.capture(actor, x.dto);
    const reviewer = { ...actor, sub: 'reviewer', role: 'COMPANY_ADMIN' };
    expect(
      (
        await x.service.review(reviewer, 'attempt', {
          action: 'ACCEPT',
          reason: 'Supervisor confirmed presence',
          workLocationId: 'site',
        })
      ).status,
    ).toBe('CONFIRMED');
    expect(x.tx.attendanceEvent.create).toHaveBeenCalledTimes(1);
    expect(x.access.requirePermission).toHaveBeenCalledWith(
      reviewer,
      Permission.MANAGE_ATTENDANCE,
    );
  });
  it('does not create attendance when a reviewer rejects an attempt', async () => {
    const x = fixture('REVIEW', true);
    await x.service.capture(actor, x.dto);
    await x.service.review({ ...actor, sub: 'reviewer' }, 'attempt', {
      action: 'REJECT',
      reason: 'Not at assigned client site',
    });
    expect(x.tx.attendanceEvent.create).not.toHaveBeenCalled();
    expect(x.attempts[0].status).toBe('REJECTED');
  });
  it('requests fresh evidence without changing a pending attempt into worked time', async () => {
    const x = fixture('REVIEW', true);
    await x.service.capture(actor, x.dto);
    await x.service.review({ ...actor, sub: 'reviewer' }, 'attempt', {
      action: 'REQUEST_LOCATION',
      reason: 'Please send a fresh location',
    });
    expect(x.attempts[0].status).toBe('PENDING');
    expect(x.tx.attendanceEvent.create).not.toHaveBeenCalled();
    expect(x.tx.attendanceAlert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ recipientUserId: 'employee-login' }),
      }),
    );
  });
  it('scopes attempts and alerts to the authenticated company', async () => {
    const x = fixture();
    x.tx.attendanceAttempt.findMany = jest.fn().mockResolvedValue([]);
    x.tx.employee.findMany = jest.fn().mockResolvedValue([]);
    x.tx.workLocation.findMany = jest.fn().mockResolvedValue([]);
    x.tx.attendanceAlert.findMany = jest.fn();
    await x.service.attempts(actor);
    await x.service.alerts(actor);
    expect(x.tx.attendanceAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          recipientUserId: actor.sub,
        }),
      }),
    );
    expect(x.tx.attendanceAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org' }),
      }),
    );
  });

  it('deduplicates scheduled reminder and supervisor alerts across scans', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:12Z'));
    try {
      const x = fixture();
      x.tx.employee.findMany = jest
        .fn()
        .mockResolvedValue([
          {
            id: 'employee',
            userId: 'employee-login',
            firstName: 'Test',
            lastName: 'Account',
          },
        ]);
      const emitted = new Set();
      x.tx.attendanceAlert.upsert.mockImplementation(async ({ where }) =>
        emitted.add(
          where.organizationId_recipientUserId_incidentKey.incidentKey,
        ),
      );
      await x.service.monitor('org');
      await x.service.monitor('org');
      expect(emitted.size).toBe(2);
      expect([...emitted]).toEqual(
        expect.arrayContaining([
          expect.stringContaining('MISSING_EMPLOYEE'),
          expect.stringContaining('MISSING_SUPERVISOR'),
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });
  it('suppresses missing-attendance alerts on approved leave', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:22Z'));
    try {
      const x = fixture();
      x.tx.employee.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'employee', userId: 'employee-login' }]);
      x.tx.leaveRequest.findFirst.mockResolvedValue({ id: 'approved-leave' });
      await x.service.monitor('org');
      expect(x.tx.attendanceAlert.upsert).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('suppresses missing alerts after a confirmed check-in', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:22Z'));
    try {
      const x = fixture();
      x.tx.employee.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'employee', userId: 'employee-login' }]);
      x.tx.attendanceEvent.findFirst.mockResolvedValue({ id: 'event' });
      await x.service.monitor('org');
      expect(x.tx.attendanceAlert.upsert).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('does not alert when the effective schedule is cancelled or absent', async () => {
    const x = fixture();
    x.tx.employee.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'employee', userId: 'employee-login' }]);
    x.service.shift.mockResolvedValue({ shift: null });
    await x.service.monitor('org');
    expect(x.tx.attendanceAlert.upsert).not.toHaveBeenCalled();
  });
  it('escalates unconfirmed attendance to operations after the configured deadline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:22Z'));
    try {
      const x = fixture();
      x.tx.employee.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'employee', userId: 'employee-login' }]);
      await x.service.monitor('org');
      expect(x.tx.attendanceAlert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ kind: 'MISSING_OPERATIONS' }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
  it('uses South African calendar dates across the UTC midnight boundary', () => {
    expect(
      localDate(new Date('2026-10-11T23:30Z'), 'Africa/Johannesburg'),
    ).toBe('2026-10-12');
  });
  it('recognises the previous day’s overnight shift', async () => {
    const x = fixture();
    delete x.service.shift;
    x.schedules.effective.mockImplementation(async (_org, _id, date) => ({
      schedule:
        date === '2026-10-11'
          ? {
              workLocationId: 'site',
              workLocation: { timezone: 'Africa/Johannesburg' },
              shift: { startMinute: 1080, endMinute: 360 },
              graceInMinutes: 5,
            }
          : null,
    }));
    const result = await x.service.shift(
      'org',
      'employee',
      new Date('2026-10-12T02:00Z'),
    );
    expect(result.shift.date).toBe('2026-10-11');
    expect(result.shift.end.toISOString()).toBe('2026-10-12T04:00:00.000Z');
  });
});
