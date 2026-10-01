import { BadRequestException } from '@nestjs/common';
import { Feature, OrganizationStatus } from '@prisma/client';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { PlatformAdminService } from '../platform-admin/platform-admin.service';
const now = new Date();
const organization = () => ({
  id: 'org-1',
  status: OrganizationStatus.PENDING,
  name: 'Acme',
  legalName: 'Acme Ltd',
  registrationNumber: 'REG-1',
  taxNumber: 'TAX-1',
  email: 'admin@acme.test',
  phoneNumber: '123',
  addressLine1: '1 Main',
  city: 'City',
  province: 'Province',
  postalCode: '1000',
  country: 'South Africa',
  timezone: 'Africa/Johannesburg',
  logoStorageKey: 'logo',
  features: [Feature.CORE_HR, Feature.LEAVE, Feature.ATTENDANCE, Feature.PAYROLL].map(feature => ({ feature, enabled: true })),
  platformSubscription: {
    status: 'ACTIVE',
    endsAt: null,
    package: {
      features: [
        Feature.CORE_HR,
        Feature.LEAVE,
        Feature.ATTENDANCE,
        Feature.PAYROLL,
      ],
    },
  },
  onboardingConfirmations: [
    { step: 'OPENING_LEAVE', confirmedAt: now },
    { step: 'OPENING_PAYROLL', confirmedAt: now },
    { step: 'PUBLIC_HOLIDAYS', confirmedAt: now },
  ],
  payrollSettings: { id: 'settings' },
  _count: {
    departments: 1,
    workLocations: 1,
    shifts: 1,
    employees: 1,
    leaveTypes: 1,
  },
});
describe('Customer onboarding go-live gate', () => {
  const db: any = {
    organization: { findUnique: jest.fn() },
    user: { count: jest.fn() },
    employee: { count: jest.fn(), findFirst: jest.fn() },
    employeePayrollProfile: { count: jest.fn() },
    leavePolicy: { count: jest.fn() },
    companyPublicHoliday: { count: jest.fn() },
    employeePaymentDetail: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new CustomerOnboardingService(db, {} as any);
  beforeEach(() => {
    jest.clearAllMocks();
    db.organization.findUnique.mockResolvedValue(organization());
    db.user.count.mockResolvedValue(1);
    db.employee.count.mockImplementation(({ where }: any) =>
      where.status === 'ACTIVE' ? 1 : 0,
    );
    db.employee.findFirst.mockResolvedValue({
      createdAt: new Date(now.getTime() - 60000),
    });
    db.employeePayrollProfile.count.mockResolvedValue(1);
    db.leavePolicy.count.mockResolvedValue(1);
    db.companyPublicHoliday.count.mockResolvedValue(0);
    db.employeePaymentDetail.findMany.mockResolvedValue([{ employeeId: 'e1' }]);
  });
  it('allows Core HR onboarding without a subscription or selected extras', async () => {
    const org = organization(); org.features = []; (org as any).platformSubscription = null; db.organization.findUnique.mockResolvedValue(org); db.employeePayrollProfile.count.mockResolvedValue(0);
    const result = await service.readiness('org-1'); expect(result.ready).toBe(true); expect(result.checklist.find(c => c.key === 'package')).toMatchObject({ required: false, ready: true }); expect(result.checklist.find(c => c.key === 'openingPayroll')?.required).toBe(false);
  });
  it('reports a complete gated setup with zero-holiday review', async () => {
    const result = await service.readiness('org-1');
    expect(result.ready).toBe(true);
    expect(result.progress.percentage).toBe(100);
  });
  it('rejects a package without the required payroll profile coverage', async () => {
    db.employeePayrollProfile.count.mockResolvedValue(0);
    const result = await service.readiness('org-1');
    expect(result.ready).toBe(false);
    expect(
      result.checklist.find((c) => c.key === 'openingPayroll'),
    ).toMatchObject({ required: true, ready: false });
  });
  it('invalidates balance confirmations made before a later employee import', async () => {
    db.employee.findFirst.mockResolvedValue({
      createdAt: new Date(now.getTime() + 60000),
    });
    const result = await service.readiness('org-1');
    expect(result.checklist.find((c) => c.key === 'openingLeave')?.ready).toBe(
      false,
    );
  });
  it('blocks platform activation while readiness has missing steps', async () => {
    const platform = new PlatformAdminService(
      db,
      {} as any,
      {
        readiness: jest
          .fn()
          .mockResolvedValue({
            ready: false,
            checklist: [{ key: 'employees', required: true, ready: false }],
          }),
      } as any,
    );
    db.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      status: OrganizationStatus.PENDING,
    });
    await expect(
      platform.changeOrganizationStatus(
        'org-1',
        { status: OrganizationStatus.ACTIVE, reason: 'Go live review' },
        { sub: 'admin', email: 'p@test', role: 'PLATFORM_ADMIN' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
