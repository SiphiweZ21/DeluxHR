import { Feature, Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { buildWhatsAppMenu, validMenuId, MenuCategory } from './whatsapp-menu';
import { WhatsAppEssService } from './whatsapp-ess.service';
import { WhatsAppEssController } from './whatsapp-ess.controller';
import {
  WhatsAppService,
  WhatsAppMessageRejected,
} from '../whatsapp/whatsapp.service';
import { hashPassword } from '../../common/auth/password';
const features = new Set([
  Feature.CORE_HR,
  Feature.WHATSAPP,
  Feature.LEAVE,
  Feature.ATTENDANCE,
  Feature.PAYSLIPS,
  Feature.EARLY_PAY,
]);
function fixture(enabled = features) {
  const session: any = {
    id: 'session',
    employeeId: 'employee',
    verifiedUntil: new Date(Date.now() + 600000),
    flow: null,
  };
  const employee = {
    id: 'employee',
    organizationId: 'org',
    firstName: 'Test',
    lastName: 'Account',
    employeeNumber: 'test123',
    user: {
      id: 'login',
      organizationId: 'org',
      isActive: true,
      email: 'test@example.com',
      role: 'EMPLOYEE',
    },
    whatsappEssIdentity: { isActive: true, pinHash: '' },
  };
  const db: any = {
    employee: { findMany: jest.fn(async () => [employee]) },
    whatsAppInboundMessage: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    whatsAppEssSession: {
      findUnique: jest.fn(async () => session),
      update: jest.fn(async ({ data }) => {
        Object.assign(session, data);
        if (data.flow === Prisma.JsonNull) session.flow = null;
      }),
    },
    leaveType: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'annual', name: 'Annual Leave' }]),
    },
  };
  const sender = { sendTextMessage: jest.fn(), sendInteractiveList: jest.fn() };
  const service = new WhatsAppEssService(
    db,
    { log: jest.fn() } as any,
    sender as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      hasFeature: jest.fn(async (_org, feature) => enabled.has(feature)),
    } as any,
    {} as any,
    {} as any,
  );
  return {
    db,
    session,
    employee,
    sender,
    process: (body: string) => service.process('message', '27821234567', body),
  };
}
describe('WhatsApp interactive menu', () => {
  it.each<MenuCategory>([
    'HOME',
    'DETAILS',
    'LEAVE',
    'ATTENDANCE',
    'PAY',
    'HR',
  ])('validates %s list payload and stable IDs', (category) => {
    const menu = buildWhatsAppMenu(features, category).interactive,
      rows = menu.action.sections.flatMap((s) => s.rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(10);
    expect(menu.header.text.length).toBeLessThanOrEqual(60);
    expect(menu.footer.text.length).toBeLessThanOrEqual(60);
    expect(menu.action.button.length).toBeLessThanOrEqual(20);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    rows.forEach((r) => {
      expect(validMenuId(r.id)).toBe(true);
      expect(r.title.length).toBeLessThanOrEqual(24);
      expect(r.description.length).toBeLessThanOrEqual(72);
    });
  });
  it('hides disabled categories and disabled options inside Pay', () => {
    const limited = new Set([Feature.CORE_HR, Feature.PAYSLIPS]);
    expect(
      buildWhatsAppMenu(limited).interactive.action.sections[0].rows.map(
        (r) => r.id,
      ),
    ).toEqual(['WA_MENU_DETAILS', 'WA_MENU_PAY', 'WA_MENU_HR']);
    expect(
      buildWhatsAppMenu(limited, 'PAY').interactive.action.sections[0].rows.map(
        (r) => r.id,
      ),
    ).toEqual(['WA_ACTION_9', 'WA_MENU_HOME']);
    expect(buildWhatsAppMenu(limited, 'PAY').fallback).not.toContain('13.');
  });
  it('opens the menu after a verified greeting', async () => {
    const x = fixture();
    await x.process('hi');
    expect(x.sender.sendInteractiveList.mock.calls[0][1].action.button).toBe(
      'Open menu',
    );
    expect(x.sender.sendTextMessage).not.toHaveBeenCalled();
  });
  it('requires a PIN before any tapped action', async () => {
    const x = fixture();
    x.session.verifiedUntil = null;
    await x.process('WA_ACTION_1');
    expect(x.sender.sendInteractiveList).not.toHaveBeenCalled();
    expect(x.sender.sendTextMessage.mock.calls[0][1]).toContain('PIN');
  });
  it('opens the menu after successful PIN verification', async () => {
    const x = fixture();
    x.session.verifiedUntil = null;
    x.employee.whatsappEssIdentity.pinHash = await hashPassword('483726');
    await x.process('PIN 483726');
    expect(x.sender.sendInteractiveList).toHaveBeenCalled();
  });
  it('opens categories and supports both tapped and typed profile commands', async () => {
    const x = fixture();
    await x.process('WA_MENU_LEAVE');
    expect(x.sender.sendInteractiveList.mock.calls[0][1].header.text).toContain(
      'Leave',
    );
    await x.process('WA_ACTION_1');
    await x.process('1');
    expect(x.sender.sendTextMessage.mock.calls.map((c) => c[1])).toEqual([
      expect.stringContaining('Test Account'),
      expect.stringContaining('Test Account'),
    ]);
  });
  it('clears an old flow before dispatching a tapped command', async () => {
    const x = fixture();
    x.session.flow = { kind: 'LEAVE_TYPE' };
    await x.process('WA_ACTION_1');
    expect(x.session.flow).toBeNull();
    expect(x.sender.sendTextMessage.mock.calls[0][1]).toContain('Profile');
  });
  it('enters the existing leave flow from a tap', async () => {
    const x = fixture();
    await x.process('WA_ACTION_3');
    expect(x.session.flow).toEqual({ kind: 'LEAVE_TYPE' });
    expect(x.sender.sendTextMessage.mock.calls[0][1]).toContain('Annual Leave');
  });
  it('rechecks features when an old option is tapped', async () => {
    const x = fixture(new Set([Feature.CORE_HR, Feature.WHATSAPP]));
    await x.process('WA_ACTION_8');
    expect(x.sender.sendTextMessage.mock.calls[0][1]).toContain(
      'Attendance is not enabled',
    );
  });
  it('supports Back and 0 navigation', async () => {
    const x = fixture();
    await x.process('WA_MENU_HOME');
    await x.process('0');
    expect(x.sender.sendInteractiveList).toHaveBeenCalledTimes(2);
  });
  it('uses a readable numbered fallback on interactive failure', async () => {
    const x = fixture();
    x.sender.sendInteractiveList.mockRejectedValue(
      new WhatsAppMessageRejected('provider', 400),
    );
    await x.process('WA_MENU_ATTENDANCE');
    expect(x.sender.sendTextMessage.mock.calls[0][1]).toContain(
      '*Attendance*\n6. Clock in\n7. Clock out',
    );
  });
  it('records a failure if both send attempts fail', async () => {
    const x = fixture();
    x.sender.sendInteractiveList.mockRejectedValue(
      new WhatsAppMessageRejected('provider', 400),
    );
    x.sender.sendTextMessage.mockRejectedValue(new Error('provider'));
    await expect(x.process('hi')).rejects.toThrow('provider');
    expect(x.db.whatsAppInboundMessage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
  it('uses the existing token transport with the interactive payload', async () => {
    const sender: any = new WhatsAppService({} as any, {} as any);
    sender.sendWhatsAppPayload = jest.fn();
    const menu = buildWhatsAppMenu(features).interactive;
    await sender.sendInteractiveList('27821234567', menu);
    expect(sender.sendWhatsAppPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '27821234567',
        type: 'interactive',
        interactive: menu,
      }),
      expect.any(String),
    );
  });
  it('accepts only known list IDs through signed webhooks', async () => {
    const saved = { ...process.env };
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'business';
    try {
      const ess = { process: jest.fn() },
        controller = new WhatsAppEssController(ess as any);
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'business' },
                  messages: ['WA_ACTION_1', 'DELETE_ALL'].map((id) => ({
                    id,
                    from: '27821234567',
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: { id, title: 'Untrusted title' },
                    },
                  })),
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(body)),
        signature =
          'sha256=' +
          createHmac('sha256', 'secret').update(rawBody).digest('hex');
      await controller.webhook({ body, rawBody } as any, signature);
      expect(ess.process).toHaveBeenCalledTimes(1);
      expect(ess.process).toHaveBeenCalledWith(
        'WA_ACTION_1',
        '27821234567',
        'WA_ACTION_1',
      );
      await expect(
        controller.webhook({ body, rawBody } as any, 'invalid'),
      ).rejects.toThrow('Invalid webhook signature');
      expect(ess.process).toHaveBeenCalledTimes(1);
    } finally {
      process.env = saved;
    }
  });
});
