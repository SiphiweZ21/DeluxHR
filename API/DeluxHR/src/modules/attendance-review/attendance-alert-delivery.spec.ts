import { AttendanceReviewService } from './attendance-review.service';
import { WhatsAppMessageRejected } from '../whatsapp/whatsapp.service';
import { DataScope, Permission } from '@prisma/client';
function fixture() {
  const alert: any = {
    id: 'alert',
    organizationId: 'org',
    employeeId: 'employee',
    recipientUserId: 'login',
    kind: 'MISSING_EMPLOYEE',
    message: 'Your attendance is not confirmed',
    whatsappStatus: 'QUEUED',
  };
  const receiver = {
    id: 'employee',
    userId: 'login',
    whatsappNumber: '+27821234567',
    firstName: 'Test',
    lastName: 'Account',
  };
  const db: any = {
    attendanceAlert: {
      findMany: jest
        .fn()
        .mockImplementation(async () =>
          alert.whatsappStatus === 'QUEUED' ? [alert] : [],
        ),
      updateMany: jest.fn(async ({ where, data }) => {
        if (
          where.whatsappStatus &&
          alert.whatsappStatus !== where.whatsappStatus
        )
          return { count: 0 };
        Object.assign(alert, data);
        return { count: 1 };
      }),
    },
    employee: { findFirst: jest.fn().mockResolvedValue(receiver) },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'reviewer',
            email: 'reviewer@example.com',
            role: 'COMPANY_ADMIN',
          },
        ]),
    },
  };
  const sender = {
    sendAttendanceAlert: jest
      .fn()
      .mockResolvedValue({ messages: [{ id: 'provider-id' }] }),
  };
  const service = new AttendanceReviewService(
    db,
    {} as any,
    {
      getEffectivePermissions: jest
        .fn()
        .mockResolvedValue([
          {
            permission: Permission.MANAGE_ATTENDANCE,
            scope: DataScope.ORGANIZATION,
          },
        ]),
    } as any,
    { hasFeature: jest.fn().mockResolvedValue(true) } as any,
    {} as any,
    sender as any,
  );
  return { alert, db, sender, service };
}
describe('Attendance WhatsApp delivery queue', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.WHATSAPP_ATTENDANCE_ALERT_TEMPLATE = 'deluxhr_attendance_alert';
  });
  afterEach(() => {
    process.env = { ...saved };
  });
  it('requires approved-template configuration before sending', async () => {
    delete process.env.WHATSAPP_ATTENDANCE_ALERT_TEMPLATE;
    const x = fixture();
    await x.service.sendQueuedAlerts('org');
    expect(x.sender.sendAttendanceAlert).not.toHaveBeenCalled();
  });
  it('claims and sends each alert only once across worker passes', async () => {
    const x = fixture();
    await Promise.all([
      x.service.sendQueuedAlerts('org'),
      x.service.sendQueuedAlerts('org'),
    ]);
    await x.service.sendQueuedAlerts('org');
    expect(x.sender.sendAttendanceAlert).toHaveBeenCalledTimes(1);
    expect(x.alert.whatsappStatus).toBe('SENT');
    expect(x.alert.whatsappProviderId).toBe('provider-id');
    expect(x.db.employee.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org',
      status: 'ACTIVE',
      whatsappOptInAt: { not: null },
      user: { isActive: true },
      whatsappEssIdentity: { isActive: true },
    });
  });
  it('does not deliver to a recipient without linked opt-in enrolment', async () => {
    const x = fixture();
    x.db.employee.findFirst.mockResolvedValue(null);
    await x.service.sendQueuedAlerts('org');
    expect(x.alert.whatsappStatus).toBe('SKIPPED');
    expect(x.sender.sendAttendanceAlert).not.toHaveBeenCalled();
  });
  it('does not expose an employee reminder to a different linked employee', async () => {
    const x = fixture();
    x.db.employee.findFirst.mockResolvedValue({
      id: 'different',
      userId: 'login',
    });
    await x.service.sendQueuedAlerts('org');
    expect(x.alert.whatsappStatus).toBe('SKIPPED');
  });
  it('keeps uncertain delivery outcomes out of automatic resend', async () => {
    const x = fixture();
    x.sender.sendAttendanceAlert.mockRejectedValue(new Error('timeout'));
    await x.service.sendQueuedAlerts('org');
    expect(x.alert.whatsappStatus).toBe('UNKNOWN');
    await x.service.sendQueuedAlerts('org');
    expect(x.sender.sendAttendanceAlert).toHaveBeenCalledTimes(1);
  });
  it('records an explicit rejection without repeated automatic sending', async () => {
    const x = fixture();
    x.sender.sendAttendanceAlert.mockRejectedValue(
      new WhatsAppMessageRejected('template rejected', 400),
    );
    await x.service.sendQueuedAlerts('org');
    expect(x.alert.whatsappStatus).toBe('REJECTED');
    await x.service.sendQueuedAlerts('org');
    expect(x.sender.sendAttendanceAlert).toHaveBeenCalledTimes(1);
  });
});
