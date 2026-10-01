import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CompanyBankingService } from './company-banking.service';
import { bankingCatalog } from './banking-adapters';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBankingProfileDto } from './company-banking.dto';
import { comparePassword } from '../../common/auth/password';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
jest.mock('../../common/auth/password', () => ({ comparePassword: jest.fn() }));
const actor: TenantJwtUser = {
  sub: 'checker',
  organizationId: 'org',
  email: 'checker@example.test',
  role: 'COMPANY_ADMIN',
};
const dto = {
  name: 'Payroll',
  adapterId: 'FNB_OBE_CSV',
  accountHolder: 'Demo Company',
  accountNumber: '00123456789',
  branchCode: '250655',
  accountType: 'CURRENT',
  ownReference: 'DEMO PAYROLL',
  reason: 'Verified bank evidence',
};
const base = {
  id: 'profile',
  organizationId: 'org',
  ...dto,
  bank: 'FNB',
  channel: 'Online Banking Enterprise',
  adapterVersion: 'SPEC_REVIEW',
  country: 'ZA',
  currency: 'ZAR',
  status: 'PENDING_APPROVAL',
  createdByUserId: 'maker',
};
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    organization: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        isActive: true,
        role: 'COMPANY_ADMIN',
        organizationId: 'org',
        passwordHash: 'hash',
      }),
    },
    companyBankingProfile: {
      findMany: jest.fn().mockResolvedValue([base]),
      findFirst: jest.fn().mockResolvedValue(base),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...base, ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...base, ...data })),
    },
    companyBankingDefault: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => create),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn().mockImplementation((f) => f(tx)),
  };
  return { tx, prisma, service: new CompanyBankingService(prisma as any) };
}
describe('Company banking profiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (comparePassword as jest.Mock).mockResolvedValue(true);
  });
  it('catalog documents configuration only and blocks every bank export', () => {
    expect(bankingCatalog().length).toBe(12);
    expect(new Set(bankingCatalog().map((a) => a.bank)).size).toBe(6);
    expect(
      bankingCatalog().every(
        (a) =>
          !a.bankImportReady &&
          ['NOT_IMPLEMENTED', 'IMPLEMENTED_FOR_TESTING'].includes(
            a.implementation,
          ),
      ),
    ).toBe(true);
  });
  it('lists only tenant data and masks account numbers', async () => {
    const { service, tx } = setup();
    const result = await service.list(actor);
    expect(tx.companyBankingProfile.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result.profiles[0].accountNumberMasked).toBe('••••6789');
    expect(JSON.stringify(result)).not.toContain('00123456789');
  });
  it.each([
    'EMPLOYEE',
    'HR_ADMIN',
    'PAYROLL_ADMIN',
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
  ])('denies %s before reads', async (role) => {
    const { service, tx } = setup();
    await expect(
      service.list({ ...actor, role } as TenantJwtUser),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.companyBankingProfile.findMany).not.toHaveBeenCalled();
  });
  it('creates immutable pending configuration from server catalog and audits without full account', async () => {
    const { service, tx } = setup();
    const result = await service.create(actor, dto);
    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.bankImportReady).toBe(false);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.companyBankingProfile.create.mock.calls[0][0].data).toMatchObject(
      {
        bank: 'FNB',
        channel: 'Online Banking Enterprise',
        createdByUserId: 'checker',
        accountNumber: '00123456789',
      },
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      '00123456789',
    );
  });
  it('allows a pending company to configure its banking', async () => {
    const { service, tx } = setup();
    tx.organization.findUnique.mockResolvedValue({ status: 'PENDING' });
    await expect(service.create(actor, dto)).resolves.toMatchObject({
      status: 'PENDING_APPROVAL',
    });
  });
  it('rejects unknown adapters and invalid account details before writes', async () => {
    const { service, tx } = setup();
    await expect(
      service.create(actor, { ...dto, adapterId: 'UNVERIFIED' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(actor, { ...dto, accountNumber: '1e10' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.companyBankingProfile.create).not.toHaveBeenCalled();
  });
  it.each(['SUSPENDED', 'REJECTED'])(
    'rejects current company status %s',
    async (status) => {
      const { service, tx } = setup();
      tx.organization.findUnique.mockResolvedValue({ status });
      await expect(service.create(actor, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.companyBankingProfile.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { isActive: false, role: 'COMPANY_ADMIN', organizationId: 'org' },
    { isActive: true, role: 'HR_ADMIN', organizationId: 'org' },
    { isActive: true, role: 'COMPANY_ADMIN', organizationId: 'other' },
  ])(
    'checks current account state inside the locked transaction %j',
    async (user) => {
      const { service, tx } = setup();
      tx.user.findUnique.mockResolvedValue(user as any);
      await expect(service.create(actor, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.companyBankingProfile.create).not.toHaveBeenCalled();
    },
  );
  it('forbids self approval', async () => {
    const { service, tx } = setup();
    tx.companyBankingProfile.findFirst.mockResolvedValue({
      ...base,
      createdByUserId: 'checker',
    });
    await expect(
      service.decide(actor, 'profile', {
        decision: 'APPROVED',
        password: 'secret',
        reason: 'Checked bank evidence',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.companyBankingProfile.update).not.toHaveBeenCalled();
  });
  it('rejects wrong checker password', async () => {
    const { service, tx } = setup();
    (comparePassword as jest.Mock).mockResolvedValue(false);
    await expect(
      service.decide(actor, 'profile', {
        decision: 'APPROVED',
        password: 'wrong',
        reason: 'Checked bank evidence',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.companyBankingProfile.update).not.toHaveBeenCalled();
  });
  it('approves independently with a transaction audit and no export readiness', async () => {
    const { service, tx } = setup();
    const result = await service.decide(actor, 'profile', {
      decision: 'APPROVED',
      password: 'secret',
      reason: 'Checked bank evidence',
    });
    expect(comparePassword).toHaveBeenCalledWith('secret', 'hash');
    expect(result).toMatchObject({
      status: 'APPROVED',
      decidedByUserId: 'checker',
      bankImportReady: false,
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'secret',
    );
  });
  it('rejects double decisions and cross-tenant profile lookup', async () => {
    const { service, tx } = setup();
    tx.companyBankingProfile.findFirst.mockResolvedValue({
      ...base,
      status: 'APPROVED',
    });
    await expect(
      service.decide(actor, 'profile', {
        decision: 'REJECTED',
        password: 'secret',
        reason: 'Reviewed again',
      }),
    ).rejects.toThrow(BadRequestException);
    tx.companyBankingProfile.findFirst.mockResolvedValue(null as any);
    await expect(
      service.retire(actor, 'other', 'Retire old account'),
    ).rejects.toThrow(NotFoundException);
    expect(tx.companyBankingProfile.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'other', organizationId: 'org' },
    });
  });
  it('rejects defaults for unapproved profiles', async () => {
    const { service, tx } = setup();
    await expect(
      service.setDefault(actor, {
        profileId: 'profile',
        purpose: 'SALARIES',
        reason: 'Use for salaries',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.companyBankingDefault.upsert).not.toHaveBeenCalled();
  });
  it('records a scoped approved default with its prior profile in audit', async () => {
    const { service, tx } = setup();
    tx.companyBankingProfile.findFirst.mockResolvedValue({
      ...base,
      status: 'APPROVED',
    });
    await service.setDefault(actor, {
      profileId: 'profile',
      purpose: 'EARLY_PAY_REPAYMENT',
      reason: 'Use for recovery',
    });
    expect(tx.companyBankingDefault.upsert.mock.calls[0][0].where).toEqual({
      organizationId_purpose: {
        organizationId: 'org',
        purpose: 'EARLY_PAY_REPAYMENT',
      },
    });
    expect(tx.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
      purpose: 'EARLY_PAY_REPAYMENT',
      previousProfileId: null,
    });
  });
  it('retires and clears only its tenant defaults atomically', async () => {
    const { service, tx } = setup();
    await service.retire(actor, 'profile', 'Account replaced');
    expect(tx.companyBankingDefault.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', profileId: 'profile' },
    });
    expect(tx.companyBankingProfile.update.mock.calls[0][0].data.status).toBe(
      'RETIRED',
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it('clears only the requested tenant purpose and rejects invented purposes', async () => {
    const { service, tx } = setup();
    await service.clearDefault(actor, 'SALARIES', 'Clear obsolete default');
    expect(tx.companyBankingDefault.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', purpose: 'SALARIES' },
    });
    await expect(
      service.clearDefault(actor, 'EARLY_PAY_PAYOUT' as any, 'Clear default'),
    ).rejects.toThrow(BadRequestException);
  });
  it('DTO preserves leading zeros and rejects scientific notation, unknown account types and injected fields', async () => {
    expect(
      await validate(plainToInstance(CreateBankingProfileDto, dto), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
    for (const patch of [
      { accountNumber: '1e10' },
      { branchCode: '25' },
      { accountType: 'BITCOIN' },
      { status: 'APPROVED' },
      { organizationId: 'other' },
    ])
      expect(
        (
          await validate(
            plainToInstance(CreateBankingProfileDto, { ...dto, ...patch }),
            { whitelist: true, forbidNonWhitelisted: true },
          )
        ).length,
      ).toBeGreaterThan(0);
  });
  it('audits password-confirmed full account inspection without recording account or password', async () => {
    const { service, tx } = setup();
    const result = await service.inspect(actor, 'profile', {
      password: 'secret',
      reason: 'Compare bank evidence',
    });
    expect(result.accountNumber).toBe('00123456789');
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      '00123456789',
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'secret',
    );
    expect(tx.companyBankingProfile.update).not.toHaveBeenCalled();
  });
  it('denies inspection with wrong password, by maker or after approval', async () => {
    const { service, tx } = setup();
    (comparePassword as jest.Mock).mockResolvedValue(false);
    await expect(
      service.inspect(actor, 'profile', {
        password: 'wrong',
        reason: 'Compare bank evidence',
      }),
    ).rejects.toThrow(BadRequestException);
    tx.companyBankingProfile.findFirst.mockResolvedValue({
      ...base,
      createdByUserId: 'checker',
    });
    await expect(
      service.inspect(actor, 'profile', {
        password: 'secret',
        reason: 'Compare bank evidence',
      }),
    ).rejects.toThrow(ForbiddenException);
    tx.companyBankingProfile.findFirst.mockResolvedValue({
      ...base,
      status: 'APPROVED',
    });
    await expect(
      service.inspect(actor, 'profile', {
        password: 'secret',
        reason: 'Compare bank evidence',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('propagates audit failure through the transaction rather than reporting success', async () => {
    const { service, tx } = setup();
    tx.auditLog.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(service.create(actor, dto)).rejects.toThrow(
      'Audit unavailable',
    );
  });
});
