import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WhatsAppEssService } from './whatsapp-ess.service';
import { validMenuId, timeLabel, actionMessage } from './whatsapp-menu';
const types = Array.from({ length: 20 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  name: i === 0 ? 'Annual Leave' : `Leave type ${i}`,
}));
function fixture() {
  const session: any = {
    id: 'session',
    employeeId: 'employee',
    verifiedUntil: new Date(Date.now() + 600000),
    flow: null,
  };
  const employee: any = {
    id: 'employee',
    organizationId: 'org',
    user: {
      id: 'login',
      organizationId: 'org',
      isActive: true,
      role: 'EMPLOYEE',
      email: 'employee@example.com',
    },
    whatsappEssIdentity: { isActive: true },
  };
  const db: any = {
    employee: { findMany: jest.fn().mockResolvedValue([employee]) },
    whatsAppInboundMessage: { update: jest.fn() },
    whatsAppEssSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      update: jest.fn(async ({ data }) => {
        Object.assign(session, data);
        if (data.flow === Prisma.JsonNull) session.flow = null;
      }),
    },
    leaveType: {
      findMany: jest.fn().mockResolvedValue(types),
      findFirst: jest.fn(async ({ where }) =>
        types.find((t) => t.id === where.id),
      ),
    },
    leaveRequest: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          leaveType: types[0],
          startDate: new Date('2026-10-15'),
          endDate: new Date('2026-10-16'),
          status: 'PENDING',
        }),
    },
  };
  const policy = {
      availability: jest
        .fn()
        .mockResolvedValue({
          balanceRequired: true,
          availableToRequest: 1.25,
          maxFullDays: 1,
          accrued: 1.25,
          used: 0,
          reserved: 0,
          negativeAllowance: 0,
        }),
    },
    leave = {
      create: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException(
            'Not enough leave. Available to request: 1.25 days. You can request up to 1 full working days.',
          ),
        ),
    },
    features = { hasFeature: jest.fn().mockResolvedValue(true) };
  const service: any = new WhatsAppEssService(
    db,
    { log: jest.fn() } as any,
    {} as any,
    leave as any,
    policy as any,
    {} as any,
    {} as any,
    {} as any,
    features as any,
    {} as any,
    {} as any,
  );
  return {
    db,
    session,
    policy,
    leave,
    features,
    handle: (text: string) => service.handle('27821234567', text, 'message'),
  };
}
describe('WhatsApp leave presentation and navigation', () => {
  it('paginates configured leave types within ten rows including navigation', async () => {
    const x = fixture();
    const reply = await x.handle('2');
    expect(reply.interactive.type).toBe('list');
    expect(reply.interactive.action.sections[0].rows).toHaveLength(9);
    for (const r of reply.interactive.action.sections[0].rows)
      expect(validMenuId(r.id)).toBe(true);
    const more = await x.handle('WA_TYPES_BALANCE_1');
    expect(more.interactive.action.sections[0].rows).toHaveLength(10);
    expect(x.session.flow.kind).toBe('BALANCE_TYPE');
  });
  it('shows a readable balance and meaningful reply buttons', async () => {
    const x = fixture();
    const reply = await x.handle('WA_TYPE_BALANCE_' + types[0].id);
    expect(reply.interactive.body.text).toContain(
      'Available to request now: 1.25 days',
    );
    expect(reply.interactive.body.text).toContain('1 full working day');
    expect(
      reply.interactive.action.buttons.map((b: any) => b.reply.title),
    ).toEqual(['Request leave', 'Back to Leave', 'Main menu']);
  });
  it('enters the date flow with availability guidance from Request leave', async () => {
    const x = fixture();
    const reply = await x.handle('WA_REQUEST_' + types[0].id);
    expect(x.session.flow).toEqual({
      kind: 'LEAVE_START',
      leaveTypeId: types[0].id,
    });
    expect(reply.interactive.body.text).toContain('1.25');
  });
  it('shows a helpful rejection instead of swallowing the balance error', async () => {
    const x = fixture();
    x.session.flow = {
      kind: 'LEAVE_END',
      leaveTypeId: types[0].id,
      startDate: '2026-10-15',
    };
    const reply = await x.handle('2026-10-16');
    expect(reply.interactive.body.text).toContain('Not enough leave');
    expect(reply.interactive.action.buttons[0].reply.title).toBe(
      'Choose new dates',
    );
  });
  it('shows a submission confirmation without exposing the internal request UUID', async () => {
    const x = fixture();
    x.leave.create.mockResolvedValue({
      id: 'internal-uuid',
      requestedWorkingDays: 1,
    });
    x.session.flow = {
      kind: 'LEAVE_END',
      leaveTypeId: types[0].id,
      startDate: '2026-10-15',
    };
    const reply = await x.handle('2026-10-15');
    expect(reply.interactive.body.text).toContain('Awaiting approval');
    expect(reply.interactive.body.text).toContain('15 October 2026');
    expect(reply.interactive.body.text).not.toContain('internal-uuid');
  });
  it('formats the latest request with human-readable dates and status', async () => {
    const x = fixture();
    const reply = await x.handle('4');
    expect(reply.interactive.body.text).toContain('15 October 2026');
    expect(reply.interactive.body.text).toContain('Awaiting approval');
  });
  it('rechecks entitlement for a stale leave button', async () => {
    const x = fixture();
    x.features.hasFeature.mockImplementation(
      async (_org, feature) => feature !== 'LEAVE',
    );
    expect(
      (await x.handle('WA_REQUEST_' + types[0].id)).interactive.body.text,
    ).toContain('not enabled');
    expect(x.session.flow).toBeNull();
  });
  it('allows cancellation from a date prompt without creating leave', async () => {
    const x = fixture();
    x.session.flow = { kind: 'LEAVE_START', leaveTypeId: types[0].id };
    await x.handle('WA_MENU_LEAVE');
    expect(x.session.flow).toBeNull();
    expect(x.leave.create).not.toHaveBeenCalled();
  });
  it('renders the clock-in UTC instant in South African local time', () => {
    expect(timeLabel('2026-10-12T05:18:02.485Z')).toContain('07:18');
    expect(timeLabel('2026-10-12T05:18:02.485Z')).not.toContain('T05:18');
  });
  it('keeps action messages inside reply-button payload limits', () => {
    const reply = actionMessage('Clock-in recorded', 'Test', [
      { id: 'WA_ACTION_5', title: 'My attendance' },
      { id: 'WA_MENU_ATTENDANCE', title: 'Attendance menu' },
      { id: 'WA_MENU_HOME', title: 'Main menu' },
    ]);
    expect(reply.interactive.body.text.length).toBeLessThanOrEqual(1024);
    expect(reply.fallback).toContain('Reply 0');
  });
});
