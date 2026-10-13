import { LeavePolicyService } from './leave-policy.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
const actor: any = {
  sub: 'admin',
  organizationId: 'org',
  role: 'COMPANY_ADMIN',
  email: 'admin@example.com',
};
function fixture(balanceRequired = true, maxNegativeDays = 0) {
  const policy: any = {
    id: 'policy',
    organizationId: 'org',
    leaveTypeId: 'annual',
    annualEntitlementDays: 15,
    accrualMode: 'MONTHLY',
    carryOverMaxDays: 0,
    carryOverExpiryMonths: 0,
    maxNegativeDays,
    probationMonths: 0,
    workingWeekdays: [1, 2, 3, 4, 5],
    excludePublicHolidays: false,
    isActive: true,
    createdAt: new Date('2026-10-01'),
    balanceRequired,
  };
  const db: any = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'employee',
        userId: 'employee-login',
        employmentStartDate: new Date('2026-10-01'),
      }),
    },
    leaveType: { findFirst: jest.fn().mockResolvedValue({ id: 'annual' }) },
    leaveApprovalWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
    leaveRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'request', ...data })),
      update: jest.fn(),
    },
    leaveBalanceAdjustment: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn(),
  };
  db.$transaction = jest.fn(async (callback) => callback(db));
  const service = new LeavePolicyService(db, {} as any);
  jest.spyOn(service, 'policyFor').mockResolvedValue(policy);
  const requests = new LeaveRequestsService(
    db,
    { log: jest.fn() } as any,
    service,
    {
      hasPermission: jest.fn().mockResolvedValue(true),
      requirePermission: jest.fn(),
    } as any,
  );
  return { db, policy, service, requests };
}
describe('Leave request capacity', () => {
  it('rechecks insufficient balance when an older pending request is approved', async () => {
    const x = fixture();
    const request = {
      id: 'old-request',
      employeeId: 'employee',
      leaveTypeId: 'annual',
      startDate: new Date('2026-10-15'),
      endDate: new Date('2026-10-16'),
      status: 'PENDING',
      submittedByUserId: 'employee-login',
      employee: { userId: 'employee-login', employmentStartDate: null },
      approvalWorkflowId: null,
    };
    x.db.leaveRequest.findFirst.mockResolvedValue(request);
    await expect(
      x.requests.updateStatus(actor, 'old-request', 'APPROVED'),
    ).rejects.toThrow('Not enough leave');
    expect(x.db.leaveRequest.update).not.toHaveBeenCalled();
  });
  it('rechecks insufficient balance before final workflow approval', async () => {
    const x = fixture();
    x.db.leaveRequest.findFirst.mockResolvedValue({
      id: 'old-request',
      employeeId: 'employee',
      leaveTypeId: 'annual',
      startDate: new Date('2026-10-15'),
      endDate: new Date('2026-10-16'),
      status: 'PENDING',
      employee: { employmentStartDate: null },
    });
    await expect(
      x.requests.finalizeWorkflowApproval(actor, 'old-request', x.db),
    ).rejects.toThrow('Not enough leave');
    expect(x.db.leaveRequest.update).not.toHaveBeenCalled();
  });
  it('credits an approved request under amendment once without releasing other reservations', async () => {
    const x = fixture();
    const own = {
      id: 'own',
      status: 'APPROVED',
      startDate: new Date('2026-10-05'),
      endDate: new Date('2026-10-05'),
      chargedDays: 1,
      chargeBreakdown: { 2026: 1 },
    };
    x.db.leaveRequest.findFirst.mockResolvedValue(own);
    x.db.leaveRequest.findMany.mockResolvedValue([own]);
    const value = await x.service.availability(
      'org',
      'employee',
      'annual',
      new Date('2026-10-15'),
      x.db,
      'own',
    );
    expect(value.availableToRequest).toBe(1.25);
  });

  it('rejects two working days against 1.25 available before creating a request', async () => {
    const x = fixture();
    await expect(
      x.requests.create(actor, {
        employeeId: 'employee',
        leaveTypeId: 'annual',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      }),
    ).rejects.toThrow('Available to request: 1.25');
    expect(x.db.leaveRequest.create).not.toHaveBeenCalled();
    expect(x.db.$executeRaw).toHaveBeenCalled();
  });
  it('allows one full working day and reports the working-day duration', async () => {
    const x = fixture();
    const result = await x.requests.create(actor, {
      employeeId: 'employee',
      leaveTypeId: 'annual',
      startDate: '2026-10-15',
      endDate: '2026-10-15',
    });
    expect(result.requestedWorkingDays).toBe(1);
    expect(result.status).toBe('PENDING');
  });
  it('reserves pending requests before accepting another request', async () => {
    const x = fixture();
    x.db.leaveRequest.findMany.mockImplementation(async ({ where }) =>
      where.status === 'APPROVED'
        ? []
        : [
            {
              id: 'pending',
              status: 'PENDING',
              startDate: new Date('2026-10-19'),
              endDate: new Date('2026-10-19'),
            },
          ],
    );
    const value = await x.service.availability(
      'org',
      'employee',
      'annual',
      new Date('2026-10-15'),
    );
    expect(value.reserved).toBe(1);
    expect(value.availableToRequest).toBe(0.25);
    expect(value.maxFullDays).toBe(0);
    await expect(
      x.service.validateCapacity(
        'org',
        'employee',
        'annual',
        new Date('2026-10-15'),
        new Date('2026-10-15'),
        x.db,
      ),
    ).rejects.toThrow('Not enough leave');
  });
  it('does not reserve approved leave that is already charged in the balance twice', async () => {
    const x = fixture();
    x.db.leaveRequest.findMany.mockResolvedValue([
      {
        status: 'APPROVED',
        startDate: new Date('2026-10-05'),
        endDate: new Date('2026-10-05'),
        chargedDays: 1,
        chargeBreakdown: { 2026: 1 },
      },
    ]);
    const value = await x.service.availability(
      'org',
      'employee',
      'annual',
      new Date('2026-10-15'),
    );
    expect(value.used).toBe(1);
    expect(value.reserved).toBe(0);
    expect(value.availableToRequest).toBe(0.25);
  });
  it('reserves future approved leave not represented in the date balance', async () => {
    const x = fixture();
    x.db.leaveRequest.findMany.mockImplementation(async ({ where }) =>
      where.status === 'APPROVED'
        ? []
        : [
            {
              status: 'APPROVED',
              startDate: new Date('2026-10-20'),
              endDate: new Date('2026-10-20'),
            },
          ],
    );
    expect(
      (
        await x.service.availability(
          'org',
          'employee',
          'annual',
          new Date('2026-10-15'),
        )
      ).reserved,
    ).toBe(1);
  });
  it('honours the configured negative allowance', async () => {
    const x = fixture(true, 1);
    await expect(
      x.requests.create(actor, {
        employeeId: 'employee',
        leaveTypeId: 'annual',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      }),
    ).resolves.toMatchObject({ requestedWorkingDays: 2 });
  });
  it('permits non-entitlement policies such as unpaid leave', async () => {
    const x = fixture(false);
    await expect(
      x.requests.create(actor, {
        employeeId: 'employee',
        leaveTypeId: 'annual',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });
  it('excludes the request under approval from reservations and uses the transaction client', async () => {
    const x = fixture();
    await x.service.validateCapacity(
      'org',
      'employee',
      'annual',
      new Date('2026-10-15'),
      new Date('2026-10-15'),
      x.db,
      'own-request',
    );
    expect(x.db.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'own-request' },
          organizationId: 'org',
          employeeId: 'employee',
        }),
      }),
    );
  });
  it('excludes public holidays and weekends from requested days', async () => {
    const x = fixture();
    x.policy.excludePublicHolidays = true;
    x.db.companyPublicHoliday = {
      findMany: jest.fn().mockResolvedValue([{ date: new Date('2026-10-16') }]),
    };
    await expect(
      x.requests.create(actor, {
        employeeId: 'employee',
        leaveTypeId: 'annual',
        startDate: '2026-10-15',
        endDate: '2026-10-18',
      }),
    ).resolves.toMatchObject({ requestedWorkingDays: 1 });
  });
  it('validates each year for requests crossing a year boundary', async () => {
    const x = fixture();
    const check = jest
      .spyOn(x.service, 'availability')
      .mockResolvedValue({ availableToRequest: 10, maxFullDays: 10 } as any);
    await x.service.validateCapacity(
      'org',
      'employee',
      'annual',
      new Date('2026-12-31'),
      new Date('2027-01-04'),
      x.db,
    );
    expect(check.mock.calls.map((c) => c[3].getUTCFullYear())).toEqual([
      2026, 2027,
    ]);
  });
});
