import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { assertPendingOnboardingChecker } from '../../common/auth/pending-onboarding-checker';
import { comparePassword } from '../../common/auth/password';
import { EmployeesService } from '../employees/employees.service';
import { EmployeePaymentDetailsService } from '../employee-payment-details/employee-payment-details.service';
import { CustomerOnboardingController } from './customer-onboarding.controller';
jest.mock('../../common/auth/password', () => ({ comparePassword: jest.fn() }));
const actor: any = {
  sub: 'checker',
  email: 'checker@example.test',
  role: UserRole.COMPANY_ADMIN,
  organizationId: 'org',
};
const bankActor: any = { id: actor.sub, email: actor.email, role: actor.role };
function fixture() {
  const users: any[] = [
    {
      id: 'maker',
      role: 'COMPANY_ADMIN',
      organizationId: 'org',
      isActive: true,
    },
    {
      id: 'checker',
      role: 'COMPANY_ADMIN',
      organizationId: 'org',
      isActive: true,
      email: actor.email,
      passwordHash: 'test-hash',
    },
  ];
  const employee: any = {
    id: 'employee',
    organizationId: 'org',
    createdByUserId: 'maker',
    status: 'PENDING_VERIFICATION',
    employeeNumber: 'EMP-001',
    firstName: 'Demo',
    lastName: 'Employee',
    email: 'demo@example.test',
    phoneNumber: '123',
    departmentId: 'department',
    department: { id: 'department' },
    jobTitle: 'Tester',
    employmentType: 'PERMANENT',
    employmentStartDate: new Date('2026-09-01'),
    employmentEndDate: null,
    identityType: 'PASSPORT',
    identityNumber: 'demo-1234',
  };
  const payment: any = {
    id: 'payment',
    employeeId: 'employee',
    organizationId: 'org',
    requestedByUserId: 'maker',
    status: 'PENDING_APPROVAL',
    version: 1,
    bankName: 'Demo',
    accountHolderName: 'Demo',
    accountNumber: 'test-account-1234',
    branchCode: '001',
    accountType: 'CURRENT',
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    organization: {
      findUnique: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(users.find((u) => u.id === where.id) ?? null),
        ),
      findMany: jest.fn().mockImplementation(() => Promise.resolve(users)),
    },
    employee: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...employee })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    riskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    employeePaymentDetail: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...payment })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ ...payment, status: 'APPROVED' }),
    },
    employeePayrollProfile: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const db: any = {
    ...tx,
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const audit: any = { log: jest.fn().mockResolvedValue({}) };
  return {
    tx,
    db,
    users,
    employee,
    payment,
    audit,
    employees: new EmployeesService(db, audit),
    payments: new EmployeePaymentDetailsService(db, audit),
  };
}
describe('Independent pending-company onboarding approvals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(comparePassword).mockResolvedValue(true);
  });
  it('allows different active company admins with organization/account locks', async () => {
    const f = fixture();
    await assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each(['ACTIVE', 'SUSPENDED', 'REJECTED'])(
    'rejects %s companies',
    async (status) => {
      const f = fixture();
      f.tx.organization.findUnique.mockResolvedValue({ status });
      await expect(
        assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('rejects self approval before locks', async () => {
    const f = fixture();
    await expect(
      assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'maker'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it.each([0, 1])('rejects inactive participant %s', async (i) => {
    const f = fixture();
    f.users[i].isActive = false;
    await expect(
      assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([0, 1])('rejects cross-company participant %s', async (i) => {
    const f = fixture();
    f.users[i].organizationId = 'other';
    await expect(
      assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'EMPLOYEE',
    'HR_ADMIN',
    'PAYROLL_ADMIN',
  ])('does not admit %s into the company-admin exception', async (role) => {
    const f = fixture();
    f.users[1].role = role;
    await expect(
      assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects missing organization or account', async () => {
    const f = fixture();
    f.tx.organization.findUnique.mockResolvedValue(null);
    await expect(
      assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.tx.organization.findUnique.mockResolvedValue({ status: 'PENDING' });
    f.users.pop();
    await expect(
      assertPendingOnboardingChecker(f.tx, 'org', 'maker', 'checker'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('activates a complete imported employee and audits maker/checker transactionally', async () => {
    const f = fixture();
    await f.employees.activate('org', 'employee', actor, true);
    expect(f.tx.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'employee',
          organizationId: 'org',
          status: 'PENDING_VERIFICATION',
        },
        data: expect.objectContaining({
          status: 'ACTIVE',
          verifiedByUserId: 'checker',
        }),
      }),
    );
    expect(f.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          makerUserId: 'maker',
          checkerUserId: 'checker',
          onboardingIndependentAdmin: true,
        }),
      }),
      f.tx,
    );
  });
  it('does not widen ordinary or active-company activation', async () => {
    const f = fixture();
    await expect(
      f.employees.activate('org', 'employee', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.tx.organization.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(
      f.employees.activate('org', 'employee', actor, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.employee.updateMany).not.toHaveBeenCalled();
  });
  it('preserves ordinary HR verification', async () => {
    const f = fixture();
    await f.employees.activate('org', 'employee', {
      ...actor,
      role: UserRole.HR_ADMIN,
    });
    expect(f.tx.employee.updateMany).toHaveBeenCalled();
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('preserves self-approval, incomplete-profile and duplicate-risk rejection', async () => {
    const f = fixture();
    await expect(
      f.employees.activate('org', 'employee', { ...actor, sub: 'maker' }, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.employee.jobTitle = '';
    await expect(
      f.employees.activate('org', 'employee', actor, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.employee.jobTitle = 'Tester';
    f.tx.riskEvent.findFirst.mockResolvedValue({ id: 'risk', status: 'OPEN' });
    await expect(
      f.employees.activate('org', 'employee', actor, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tx.employee.updateMany).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('rejects stale checker role before activation', async () => {
    const f = fixture();
    f.users[1].role = 'EMPLOYEE';
    await expect(
      f.employees.activate('org', 'employee', actor, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.employee.updateMany).not.toHaveBeenCalled();
  });
  it('does not audit a stale employee transition', async () => {
    const f = fixture();
    f.tx.employee.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.employees.activate('org', 'employee', actor, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('approves bank details after password verification with masking and audit', async () => {
    const f = fixture();
    const r = await f.payments.approve(
      'org',
      'employee',
      'payment',
      'checker-password',
      bankActor,
      true,
    );
    expect(comparePassword).toHaveBeenCalledWith(
      'checker-password',
      'test-hash',
    );
    expect(f.tx.employeePayrollProfile.upsert).toHaveBeenCalled();
    expect(r).not.toHaveProperty('accountNumber');
    expect(r.maskedAccountNumber).toContain('1234');
    expect(f.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          requestedByUserId: 'maker',
          reauthenticated: true,
          onboardingIndependentAdmin: true,
        }),
      }),
      f.tx,
    );
  });
  it('rejects bad bank password before any supersession or payroll update', async () => {
    const f = fixture();
    jest.mocked(comparePassword).mockResolvedValue(false);
    await expect(
      f.payments.approve(
        'org',
        'employee',
        'payment',
        'wrong',
        bankActor,
        true,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.tx.employeePaymentDetail.updateMany).not.toHaveBeenCalled();
    expect(f.tx.employeePayrollProfile.upsert).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('blocks bank self approval and ordinary/active-company company-admin approval', async () => {
    const f = fixture();
    await expect(
      f.payments.approve(
        'org',
        'employee',
        'payment',
        'password',
        { ...bankActor, id: 'maker' },
        true,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.payments.approve('org', 'employee', 'payment', 'password', bankActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.tx.organization.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(
      f.payments.approve(
        'org',
        'employee',
        'payment',
        'password',
        bankActor,
        true,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.employeePaymentDetail.updateMany).not.toHaveBeenCalled();
  });
  it('enables the exception from onboarding controller only', () => {
    const c: any = Object.create(CustomerOnboardingController.prototype);
    c.onboarding = { assertAdmin: jest.fn() };
    c.employees = { activate: jest.fn() };
    c.paymentDetails = { approve: jest.fn() };
    c.activateEmployee(actor, 'employee');
    expect(c.employees.activate).toHaveBeenCalledWith(
      'org',
      'employee',
      actor,
      true,
    );
    c.approvePayment(actor, 'employee', 'payment', { password: 'password' });
    expect(c.paymentDetails.approve).toHaveBeenCalledWith(
      'org',
      'employee',
      'payment',
      'password',
      bankActor,
      true,
    );
  });
  it('rejects an already approved bank version before any writes', async () => {
    const f = fixture();
    f.payment.status = 'APPROVED';
    await expect(
      f.payments.approve(
        'org',
        'employee',
        'payment',
        'password',
        bankActor,
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tx.employeePaymentDetail.updateMany).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });
});
