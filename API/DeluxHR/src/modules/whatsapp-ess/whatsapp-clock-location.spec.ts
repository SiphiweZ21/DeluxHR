import { WhatsAppEssService } from './whatsapp-ess.service';
import { AttendanceEventsService } from '../attendance-events/attendance-events.service';
import { WhatsAppEssController } from './whatsapp-ess.controller';
import { createHmac } from 'crypto';
function setup(flow: any = null, latest: any = null) {
  const session: any = {
    id: 'session',
    employeeId: 'employee',
    verifiedUntil: new Date(Date.now() + 600000),
    flow,
  };
  const db: any = {
    employee: {
      findMany: jest.fn(async () => [
        {
          id: 'employee',
          organizationId: 'org',
          user: { id: 'user', email: 'e@test', role: 'EMPLOYEE' },
          whatsappEssIdentity: { isActive: true },
        },
      ]),
    },
    whatsAppInboundMessage: { update: jest.fn() },
    whatsAppEssSession: {
      findUnique: jest.fn(async () => session),
      update: jest.fn(async ({ data }) => {
        Object.assign(session, data);
      }),
      updateMany: jest.fn(async () => {
        session.flow = null;
        return { count: 1 };
      }),
    },
    attendanceEvent: { findFirst: jest.fn(async () => latest) },
    employeeWorkLocationAssignment: {
      findFirst: jest.fn(async () => ({ workLocationId: 'site' })),
    },
  };
  const attendance: any = { create: jest.fn(async () => ({ id: 'event' })) },
    entitlements: any = { hasFeature: jest.fn(async () => true) },
    audit: any = { log: jest.fn() };
  const service = new WhatsAppEssService(
    db,
    audit,
    {} as any,
    {} as any,
    {} as any,
    attendance,
    {} as any,
    {} as any,
    entitlements,
    {} as any,
    {} as any,
  );
  return {
    db,
    session,
    attendance,
    entitlements,
    handle: (text: string, location?: any) =>
      (service as any).handle('27821234567', text, 'message-id', location),
  };
}
const flow = (eventType = 'CHECK_IN') => ({
  kind: 'CLOCK_LOCATION',
  eventType,
  requestedAt: new Date().toISOString(),
});
describe('WhatsApp attendance location flow', () => {
  it('requests location without recording attendance on option 6', async () => {
    const x = setup();
    expect(await x.handle('6')).toContain('Send your current location');
    expect(x.session.flow.kind).toBe('CLOCK_LOCATION');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('requires a verified PIN session before accepting location', async () => {
    const x = setup(flow());
    x.session.verifiedUntil = null;
    expect(
      await x.handle('[location]', { latitude: 1, longitude: 2 }),
    ).toContain('PIN');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it.each(['CHECK_IN', 'CHECK_OUT'])(
    'captures %s with coordinates, assigned site and location message reference',
    async (type) => {
      const x = setup(
        flow(type),
        type === 'CHECK_OUT' ? { eventType: 'CHECK_IN' } : null,
      );
      const result = await x.handle('[location]', {
        latitude: -29.85,
        longitude: 31.02,
      });
      expect(result).toContain('recorded');
      expect(x.attendance.create).toHaveBeenCalledWith(
        'org',
        expect.objectContaining({
          employeeId: 'employee',
          eventType: type,
          channel: 'WHATSAPP',
          workLocationId: 'site',
          latitude: -29.85,
          longitude: 31.02,
          sourceReference: 'message-id',
        }),
        expect.objectContaining({ organizationId: 'org', sub: 'user' }),
      );
      expect(x.session.flow).not.toEqual(
        expect.objectContaining({ kind: 'CLOCK_LOCATION' }),
      );
    },
  );
  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 1 },
    { latitude: '1', longitude: 2 },
    undefined,
  ])('rejects invalid or missing location %p', async (location) => {
    const x = setup(flow());
    expect(await x.handle('[location]', location)).toContain('No attendance');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('does not capture an unsolicited location', async () => {
    const x = setup();
    expect(
      await x.handle('[location]', { latitude: 0, longitude: 0 }),
    ).toContain('Choose 6');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('expires an old pending request', async () => {
    const x = setup({
      ...flow(),
      requestedAt: new Date(Date.now() - 301000).toISOString(),
    });
    expect(
      await x.handle('[location]', { latitude: 0, longitude: 0 }),
    ).toContain('expired');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('allows menu cancellation without recording attendance', async () => {
    const x = setup(flow());
    await x.handle('0');
    expect(x.attendance.create).not.toHaveBeenCalled();
    expect(x.session.flow).not.toEqual(
      expect.objectContaining({ kind: 'CLOCK_LOCATION' }),
    );
  });
  it('rechecks the attendance sequence before capture', async () => {
    const x = setup(flow(), { eventType: 'CHECK_IN' });
    expect(
      await x.handle('[location]', { latitude: 0, longitude: 0 }),
    ).toContain('sequence has changed');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('rejects clock-out without an earlier event', async () => {
    const x = setup();
    expect(await x.handle('7')).toContain('sequence');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('rechecks attendance entitlement during the flow', async () => {
    const x = setup(flow());
    x.entitlements.hasFeature.mockImplementation(
      async (_org, feature) => feature !== 'ATTENDANCE',
    );
    expect(
      await x.handle('[location]', { latitude: 0, longitude: 0 }),
    ).toContain('not enabled');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('does not return success when policy rejects the capture', async () => {
    const x = setup(flow());
    x.attendance.create.mockRejectedValue(new Error('policy'));
    expect(
      await x.handle('[location]', { latitude: 0, longitude: 0 }),
    ).toContain('could not be confirmed');
  });
  it('does not capture a pending request already claimed or cancelled', async () => {
    const x = setup(flow());
    x.db.whatsAppEssSession.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await x.handle('[location]', { latitude: 0, longitude: 0 }),
    ).toContain('already handled');
    expect(x.attendance.create).not.toHaveBeenCalled();
  });
  it('forwards location only through a signed webhook for the configured business number', async () => {
    const prevSecret = process.env.WHATSAPP_APP_SECRET,
      prevPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
    try {
      process.env.WHATSAPP_APP_SECRET = 'test-secret';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'business';
      const ess: any = { process: jest.fn() };
      const controller = new WhatsAppEssController(ess);
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'business' },
                  messages: [
                    {
                      id: 'loc-id',
                      from: '2782',
                      type: 'location',
                      location: { latitude: -29, longitude: 31 },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(body));
      await controller.webhook(
        { body, rawBody } as any,
        'sha256=' +
          createHmac('sha256', 'test-secret').update(rawBody).digest('hex'),
      );
      expect(ess.process).toHaveBeenCalledWith('loc-id', '2782', '[location]', {
        latitude: -29,
        longitude: 31,
      });
    } finally {
      if (prevSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
      else process.env.WHATSAPP_APP_SECRET = prevSecret;
      if (prevPhone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      else process.env.WHATSAPP_PHONE_NUMBER_ID = prevPhone;
    }
  });
});
describe('Attendance event history boundary', () => {
  it('scopes paginated events and count to the company', async () => {
    const db: any = {
      attendanceEvent: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 60),
      },
    };
    const s = new AttendanceEventsService(db, {} as any);
    expect(await s.list('org', '2')).toMatchObject({
      page: 2,
      pageSize: 50,
      total: 60,
    });
    expect(db.attendanceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org' },
        skip: 50,
        take: 50,
      }),
    );
    expect(db.attendanceEvent.count).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
    });
  });
  it.each(['0', '-1', 'abc', '100001'])('rejects page %s', async (page) => {
    await expect(
      new AttendanceEventsService({} as any, {} as any).list('org', page),
    ).rejects.toThrow('Invalid page');
  });
});
