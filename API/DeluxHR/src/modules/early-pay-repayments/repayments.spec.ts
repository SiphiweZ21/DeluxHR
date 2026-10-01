import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EarlyPayRepaymentsService } from './repayments.service';
import {
  EarlyPayRepaymentsController,
  PlatformEarlyPayRepaymentsController,
} from './repayments.controller';
import {
  PrepareRepaymentDto,
  RecordRepaymentReceiptDto,
  RepaymentActionDto,
} from './repayments.dto';
import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import { PlatformRoleGuard } from '../../common/auth/platform-role.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/access/require-permissions.decorator';
import { PayrollService } from '../payroll/payroll.service';
import type {
  TenantJwtUser,
  PlatformJwtUser,
} from '../../common/auth/jwt-user.type';
jest.mock('../../common/auth/password', () => ({
  comparePassword: jest.fn(async (p: string) => p === 'correct'),
}));
const maker: TenantJwtUser = {
    sub: 'maker',
    organizationId: 'org',
    role: 'COMPANY_ADMIN',
    email: 'maker@test',
  },
  checker: TenantJwtUser = { ...maker, sub: 'checker' };
const platform: PlatformJwtUser = {
    sub: 'platform1',
    organizationId: null,
    role: 'PLATFORM_ADMIN',
    email: 'platform@test',
  },
  platform2: PlatformJwtUser = { ...platform, sub: 'platform2' };
const auth = {
  password: 'correct',
  reason: 'Checked the supporting bank evidence',
};
const clone = (x: any) => JSON.parse(JSON.stringify(x));
function setup(status = 'PREPARED') {
  const funding: any = {
    id: 'funding',
    organizationId: 'org',
    status: 'APPROVED',
    currency: 'ZAR',
    name: 'Company',
    bank: 'FNB',
    channel: 'Online Banking Enterprise',
    adapterId: 'FNB_OBE_BANKSERV',
    adapterVersion: '2023-02',
    accountNumber: '123456789',
    branchCode: '250655',
    ownReference: 'EARLY PAY',
  };
  const destination: any = {
    id: 'destination',
    status: 'APPROVED',
    name: 'DeluxHR',
    bank: 'FNB',
    accountHolder: 'DELUXHR',
    accountNumber: '987654321',
    branchCode: '250655',
    accountType: 'CURRENT',
  };
  const request: any = {
    id: 'request',
    organizationId: 'org',
    employeeId: 'employee',
    status: 'RECOVERED',
    payrollRunId: 'run',
    requestedAmount: 100,
    netDisbursement: 100,
    serviceFee: 0,
    transferFee: 5,
    instantFee: 0,
    totalPayrollRecovery: 105,
    paymentReference: 'BANK-PAID',
    treasuryItems: [{ id: 'payout', amountCents: 10000 }],
  };
  const entry: any = {
    id: 'ledger',
    organizationId: 'org',
    employeeId: 'employee',
    payrollRunId: 'run',
    amount: 105,
    currency: 'ZAR',
    sourceType: 'EARLY_PAY_REQUEST',
    sourceId: 'request',
    employee: { firstName: 'Alice', lastName: 'Test' },
    payrollRun: {
      id: 'run',
      employeeId: 'employee',
      status: 'PAID',
      currency: 'ZAR',
    },
    repaymentItems: [],
  };
  const item: any = {
    id: 'item',
    ledgerEntryId: 'ledger',
    requestId: 'request',
    activeLedgerEntryId: 'ledger',
    activeRequestId: 'request',
    employeeName: 'Alice Test',
    payrollRunId: 'run',
    amountCents: 10500,
    principalCents: 10000,
    feeCents: 500,
    cancelled: false,
  };
  const batch: any = {
    id: 'batch',
    organizationId: 'org',
    organization: { name: 'Company' },
    period: '2026-09',
    status,
    fundingProfileId: 'funding',
    destinationAccountId: 'destination',
    fundingSnapshot: { profileId: 'funding', ...funding },
    destinationSnapshot: {
      profileId: 'destination',
      name: 'DeluxHR',
      bankName: 'FNB',
      accountHolderName: 'DELUXHR',
      accountNumber: '987654321',
      branchCode: '250655',
      accountType: 'CURRENT',
    },
    paymentDate: new Date('2026-10-01'),
    paymentReference: 'ERABCDEFABCDEFABCDEF',
    totalCents: 10500,
    preparedBy: 'maker',
    approvedBy: status === 'PREPARED' ? null : 'checker',
    items: [item],
    receipts: [],
  };
  const tx: any = {
    $queryRaw: jest.fn(async () => []),
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({
        isActive: true,
        organizationId: where.id.startsWith('platform') ? null : 'org',
        role: where.id.startsWith('platform')
          ? 'PLATFORM_ADMIN'
          : 'COMPANY_ADMIN',
        passwordHash: 'hash',
      })),
    },
    organization: { findUnique: jest.fn(async () => ({ status: 'ACTIVE' })) },
    organizationFeature: {
      findUnique: jest.fn(async () => ({ enabled: true })),
    },
    platformSubscription: { findUnique: jest.fn(async () => null) },
    payrollLedgerEntry: { findMany: jest.fn(async () => [clone(entry)]) },
    earlyPayRequest: {
      findMany: jest.fn(async () => [clone(request)]),
      updateMany: jest.fn(),
    },
    earlyPayRepaymentItem: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async ({ data }: any) => {
        Object.assign(item, data);
        return { count: 1 };
      }),
    },
    companyBankingProfile: {
      findFirst: jest.fn(async () => clone(funding)),
      findMany: jest.fn(async () => [clone(funding)]),
    },
    companyBankingDefault: {
      findUnique: jest.fn(async () => ({ profileId: 'funding' })),
    },
    platformFundingAccount: {
      findUnique: jest.fn(async () => clone(destination)),
      findMany: jest.fn(async () => [clone(destination)]),
    },
    earlyPayRepaymentDestination: {
      findUnique: jest.fn(async () => ({
        accountId: 'destination',
        account: clone(destination),
      })),
      upsert: jest.fn(async ({ update }: any) => ({
        ...update,
        id: 'DEFAULT',
      })),
    },
    earlyPayRepaymentBatch: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.organizationId && where.organizationId !== 'org'
          ? null
          : { ...clone(batch), paymentDate: batch.paymentDate },
      ),
      findMany: jest.fn(async () => [
        { ...clone(batch), paymentDate: batch.paymentDate },
      ]),
      update: jest.fn(async ({ data }: any) => Object.assign(batch, data)),
      create: jest.fn(async ({ data }: any) => {
        Object.assign(batch, data);
        batch.items = data.items.create.map((i: any) => ({
          ...i,
          id: 'new-item',
        }));
        batch.receipts = [];
        return { ...clone(batch), paymentDate: batch.paymentDate };
      }),
    },
    earlyPayRepaymentReceipt: {
      create: jest.fn(async ({ data }: any) => {
        const receipt = {
          ...data,
          id: 'receipt' + (batch.receipts.length + 1),
          status: 'RECORDED',
        };
        batch.receipts.push(receipt);
        return clone(receipt);
      }),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          batch.receipts.find((r: any) => r.id === where.id),
          data,
        ),
      ),
    },
    platformAuditEvent: { create: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const access: any = {
    getEffectivePermissions: jest.fn(async () =>
      [
        Permission.VIEW_PAYROLL,
        Permission.PREPARE_PAYROLL_PAYMENTS,
        Permission.APPROVE_PAYROLL_PAYMENTS,
        Permission.EXPORT_PAYROLL_PAYMENTS,
      ].map((permission) => ({ permission, scope: 'ORGANIZATION' })),
    ),
  };
  const db: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return {
    service: new EarlyPayRepaymentsService(db, access),
    tx,
    db,
    access,
    batch,
    item,
    funding,
    destination,
    request,
    entry,
  };
}
const preparation = {
  period: '2026-09',
  ledgerEntryIds: ['ledger'],
  paymentDate: '2026-10-01',
  reason: 'Payroll deductions ready to repay',
};
const receipt = {
  ...auth,
  amountCents: 5000,
  receivedAt: '2026-09-29',
  bankReference: 'bank-incoming-123',
  evidence: 'Receipt visible on the DeluxHR bank statement',
};
describe('Employer Early Pay repayment scope and eligibility', () => {
  it('declares organization permission guards and platform guards separately', () => {
    expect(
      Reflect.getMetadata('__guards__', EarlyPayRepaymentsController),
    ).toContain(OrganizationPermissionsGuard);
    expect(
      Reflect.getMetadata('__guards__', PlatformEarlyPayRepaymentsController),
    ).toContain(PlatformRoleGuard);
    for (const method of [
      'register',
      'detail',
      'prepare',
      'approve',
      'cancel',
      'submit',
      'inspect',
      'report',
      'draft',
      'export',
    ])
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_KEY,
          EarlyPayRepaymentsController.prototype[method],
        ),
      ).toHaveLength(1);
  });
  it('queries paid payroll recovery deductions in the current company and period only', async () => {
    const h = setup();
    const r = await h.service.register(maker, '2026-09');
    expect(r.availableCents).toBe(10500);
    expect(
      h.tx.payrollLedgerEntry.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      organizationId: 'org',
      code: 'EARLY_PAY_RECOVERY',
      category: 'EARLY_PAY_RECOVERY',
      effect: 'EMPLOYEE_DEDUCTION',
      payrollRun: { organizationId: 'org', status: 'PAID' },
    });
  });
  it('allows a paid-ledger recovery with an old PAID marker only when payout is confirmed', async () => {
    const h = setup();
    h.request.status = 'PAID';
    h.request.payrollRunId = null;
    expect((await h.service.register(maker, '2026-09')).rows[0].eligible).toBe(
      true,
    );
  });
  it.each(['PENDING', 'APPROVED', 'PROCESSING', 'PAYMENT_FAILED'])(
    'excludes request state %s',
    async (status) => {
      const h = setup();
      h.request.status = status;
      expect(
        (await h.service.register(maker, '2026-09')).rows[0].eligible,
      ).toBe(false);
    },
  );
  it('excludes simulated historical payouts', async () => {
    const h = setup();
    h.request.paymentReference = 'SIM-legacy';
    expect((await h.service.register(maker, '2026-09')).rows[0].reason).toMatch(
      /simulated/,
    );
  });
  it('excludes payments without confirmed treasury payout items', async () => {
    const h = setup();
    h.request.treasuryItems = [];
    expect((await h.service.register(maker, '2026-09')).rows[0].eligible).toBe(
      false,
    );
  });
  it('requires the payroll principal to equal the frozen confirmed payout', async () => {
    const h = setup();
    h.request.treasuryItems[0].amountCents = 9000;
    expect((await h.service.register(maker, '2026-09')).rows[0].reason).toMatch(
      /payout.*principal/,
    );
  });
  it('excludes mismatched employee or source type', async () => {
    const h = setup();
    h.entry.employeeId = 'other';
    expect((await h.service.register(maker, '2026-09')).rows[0].eligible).toBe(
      false,
    );
    h.entry.employeeId = 'employee';
    h.entry.sourceType = 'OTHER';
    expect((await h.service.register(maker, '2026-09')).rows[0].eligible).toBe(
      false,
    );
  });
  it('excludes recovered requests assigned to another payroll', async () => {
    const h = setup();
    h.request.payrollRunId = 'other';
    expect((await h.service.register(maker, '2026-09')).rows[0].eligible).toBe(
      false,
    );
  });
  it('blocks principal/fee/ledger mismatches', async () => {
    const h = setup();
    h.entry.amount = 104;
    expect((await h.service.register(maker, '2026-09')).rows[0].reason).toMatch(
      /reconcile/,
    );
  });
  it('blocks both ambiguous duplicate recovery entries', async () => {
    const h = setup();
    h.tx.payrollLedgerEntry.findMany.mockResolvedValue([
      clone(h.entry),
      { ...clone(h.entry), id: 'duplicate' },
    ]);
    expect(
      (await h.service.register(maker, '2026-09')).rows.every(
        (r) => !r.eligible,
      ),
    ).toBe(true);
  });
  it('blocks active request allocation even with another ledger ID', async () => {
    const h = setup();
    h.tx.earlyPayRepaymentItem.findMany.mockResolvedValue([
      { activeRequestId: 'request', batchId: 'existing' },
    ]);
    const r = (await h.service.register(maker, '2026-09')).rows[0];
    expect(r.eligible).toBe(false);
    expect(r.allocatedBatchId).toBe('existing');
  });
  it('blocks mixed currency recoveries', async () => {
    const h = setup();
    h.entry.currency = 'USD';
    expect((await h.service.register(maker, '2026-09')).rows[0].eligible).toBe(
      false,
    );
  });
  it('masks destination and funding in ordinary register/detail responses', async () => {
    const h = setup();
    const r = await h.service.register(maker, '2026-09');
    expect(JSON.stringify(r)).not.toContain('123456789');
    expect(JSON.stringify(r)).not.toContain('987654321');
    const b = await h.service.detail(maker, 'batch');
    expect((b as any).fundingSnapshot).toBeUndefined();
    expect((b as any).destinationSnapshot).toBeUndefined();
  });
  it('scopes batch lookup to the caller organization', async () => {
    const h = setup();
    await expect(
      h.service.detail({ ...maker, organizationId: 'foreign' }, 'batch'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      h.tx.earlyPayRepaymentBatch.findFirst.mock.calls[0][0].where,
    ).toEqual({ id: 'batch', organizationId: 'foreign' });
  });
  it('rejects invalid periods and oversized period registers', async () => {
    const h = setup();
    await expect(h.service.register(maker, '1999-09')).rejects.toThrow(
      'Period',
    );
    h.tx.payrollLedgerEntry.findMany.mockResolvedValue(
      Array(1001).fill(h.entry),
    );
    await expect(h.service.register(maker, '2026-09')).rejects.toThrow('1000');
  });
});
describe('Employer repayment preparation and company controls', () => {
  it('freezes approved source/default funding, receiving account, principal and fees', async () => {
    const h = setup();
    const b = await h.service.prepare(maker, preparation);
    expect(b.totalCents).toBe(10500);
    expect(b.items[0]).toMatchObject({
      principalCents: 10000,
      feeCents: 500,
      amountCents: 10500,
      activeRequestId: 'request',
      activeLedgerEntryId: 'ledger',
    });
    expect(
      h.tx.earlyPayRepaymentBatch.create.mock.calls[0][0].data
        .destinationSnapshot.accountNumber,
    ).toBe('987654321');
    expect(
      h.tx.companyBankingDefault.findUnique.mock.calls[0][0].where
        .organizationId_purpose.purpose,
    ).toBe('EARLY_PAY_REPAYMENT');
    expect(b.paymentReference).toMatch(/^ER[A-F0-9]{18}$/);
    expect(h.tx.earlyPayRequest.updateMany).not.toHaveBeenCalled();
  });
  it('rejects unavailable or foreign recovery IDs', async () => {
    const h = setup();
    await expect(
      h.service.prepare(maker, { ...preparation, ledgerEntryIds: ['foreign'] }),
    ).rejects.toThrow('unavailable');
    expect(h.tx.earlyPayRepaymentBatch.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate input and unsupported date before mutation', async () => {
    const h = setup();
    await expect(
      h.service.prepare(maker, {
        ...preparation,
        ledgerEntryIds: ['ledger', 'ledger'],
      }),
    ).rejects.toThrow('distinct');
    await expect(
      h.service.prepare(maker, { ...preparation, paymentDate: 'bad' }),
    ).rejects.toThrow('date');
  });
  it('requires an approved company funding profile and configured receiving account', async () => {
    const h = setup();
    h.tx.companyBankingProfile.findFirst.mockResolvedValue(null);
    await expect(h.service.prepare(maker, preparation)).rejects.toThrow(
      'funding',
    );
    h.tx.companyBankingProfile.findFirst.mockResolvedValue(h.funding);
    h.tx.earlyPayRepaymentDestination.findUnique.mockResolvedValue(null);
    await expect(h.service.prepare(maker, preparation)).rejects.toThrow(
      'receiving',
    );
  });
  it('rejects SELF/TEAM grants even after controller checks', async () => {
    const h = setup();
    h.access.getEffectivePermissions.mockResolvedValue([
      { permission: 'PREPARE_PAYROLL_PAYMENTS', scope: 'SELF' },
    ]);
    await expect(h.service.prepare(maker, preparation)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('rechecks current actor, active organization and Payroll availability', async () => {
    const h = setup();
    h.tx.user.findUnique.mockResolvedValue({ isActive: false });
    await expect(h.service.prepare(maker, preparation)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const h2 = setup();
    h2.tx.organizationFeature.findUnique.mockResolvedValue({ enabled: false });
    await expect(h2.service.prepare(maker, preparation)).rejects.toThrow(
      'Payroll',
    );
  });
  it('blocks inactive or payroll-excluding subscriptions', async () => {
    const h = setup();
    h.tx.platformSubscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      endsAt: null,
      package: { features: ['CORE_HR'] },
    });
    await expect(h.service.prepare(maker, preparation)).rejects.toThrow(
      'Payroll',
    );
  });
  it('rejects maker release and incorrect passwords', async () => {
    const h = setup();
    await expect(h.service.approve(maker, 'batch', auth)).rejects.toThrow(
      'independent',
    );
    await expect(
      h.service.approve(checker, 'batch', { ...auth, password: 'wrong' }),
    ).rejects.toThrow('Password');
    expect(h.tx.earlyPayRepaymentBatch.update).not.toHaveBeenCalled();
  });
  it('independent release and report downloads do not mark repayment received', async () => {
    const h = setup();
    await h.service.approve(checker, 'batch', auth);
    expect(h.batch.status).toBe('APPROVED');
    await h.service.download(maker, 'batch', 'report');
    expect(h.batch.status).toBe('APPROVED');
    expect(h.tx.earlyPayRepaymentReceipt.create).not.toHaveBeenCalled();
  });
  it('blocks release when a frozen bank account has been retired', async () => {
    const h = setup();
    h.destination.status = 'RETIRED';
    await expect(h.service.approve(checker, 'batch', auth)).rejects.toThrow(
      'no longer approved',
    );
  });
  it('records manual employer submission without repaying the debt', async () => {
    const h = setup('APPROVED');
    const b = await h.service.submit(maker, 'batch', {
      ...auth,
      method: 'MANUAL_BANK_PORTAL',
      bankReference: 'employer-bank-1',
      evidence: 'Manual portal initiation confirmation',
    });
    expect(b.status).toBe('SUBMITTED');
    expect(b.outstandingCents).toBe(10500);
    expect(h.tx.earlyPayRepaymentReceipt.create).not.toHaveBeenCalled();
  });
  it('does not accept draft upload as manual bank submission', async () => {
    const h = setup('APPROVED');
    await expect(
      h.service.submit(maker, 'batch', {
        ...auth,
        method: 'BANK_FILE' as any,
        bankReference: 'bank1',
        evidence: 'Draft uploaded',
      }),
    ).rejects.toThrow('manual');
  });
  it('pre-submission cancellation releases both unique allocations and preserves items', async () => {
    const h = setup();
    await h.service.cancel(maker, 'batch', auth);
    expect(h.item.cancelled).toBe(true);
    expect(h.item.activeLedgerEntryId).toBeNull();
    expect(h.item.activeRequestId).toBeNull();
    expect(h.batch.status).toBe('CANCELLED');
  });
  it.each(['SUBMITTED', 'PARTIALLY_REPAID', 'REPAID'])(
    'prevents cancellation after %s',
    async (status) => {
      const h = setup(status);
      await expect(h.service.cancel(maker, 'batch', auth)).rejects.toThrow(
        'unsubmitted',
      );
    },
  );
  it('full bank inspection requires password and release', async () => {
    const h = setup();
    await expect(h.service.inspect(maker, 'batch', auth)).rejects.toThrow(
      'Release',
    );
    h.batch.status = 'APPROVED';
    const d = await h.service.inspect(maker, 'batch', auth);
    expect((d.destination as any).accountNumber).toBe('987654321');
    expect(h.tx.auditLog.create).toHaveBeenCalled();
  });
  it('produces one separate repayment instruction using frozen funding/destination', async () => {
    const h = setup('APPROVED');
    const f = await h.service.download(maker, 'batch', 'draft');
    expect(f.fileName).toMatch(
      /^DRAFT-NOT-FOR-BANK-UPLOAD-EARLY-PAY-REPAYMENT/,
    );
    expect(f.sha256).toHaveLength(64);
    expect(
      f.content
        .toString()
        .split('\r\n')
        .filter((l) => l.startsWith('10')),
    ).toHaveLength(1);
    expect(h.batch.status).toBe('APPROVED');
  });
  it('escapes spreadsheet formulas and omits accounts from repayment reports', async () => {
    const h = setup('APPROVED');
    h.item.employeeName = '\t=EVIL()';
    const f = await h.service.download(maker, 'batch', 'report');
    expect(f.content.toString()).toContain("' =EVIL");
    expect(f.content.toString()).not.toContain('987654321');
  });
  it('blocks unverified production bank exports', () => {
    expect(() => setup().service.productionExport()).toThrow('No verified');
  });
  it('concurrent or duplicate allocation errors become refreshable 409 conflicts', async () => {
    const h = setup();
    h.db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(h.service.prepare(maker, preparation)).rejects.toMatchObject({
      status: 409,
    });
  });
});
describe('Independent platform bank receipts', () => {
  it('tenant accounts cannot configure destinations or record platform receipts', async () => {
    const h = setup('SUBMITTED');
    await expect(
      h.service.receipt(maker as any, 'batch', receipt),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      h.service.platformWorkspace(maker as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('destination configuration accepts approved platform accounts only and leaves old snapshots unchanged', async () => {
    const h = setup();
    await h.service.destination(platform, {
      ...auth,
      accountId: 'destination',
    });
    expect(h.tx.earlyPayRepaymentDestination.upsert).toHaveBeenCalled();
    expect(h.tx.earlyPayRepaymentBatch.update).not.toHaveBeenCalled();
    h.destination.status = 'RETIRED';
    await expect(
      h.service.destination(platform, { ...auth, accountId: 'destination' }),
    ).rejects.toThrow('approved');
  });
  it('records a receipt as pending without reducing debt', async () => {
    const h = setup('SUBMITTED');
    const b = await h.service.receipt(platform, 'batch', receipt);
    expect(b.pendingCents).toBe(5000);
    expect(b.confirmedCents).toBe(0);
    expect(b.outstandingCents).toBe(10500);
    expect(b.status).toBe('SUBMITTED');
  });
  it('normalizes incoming bank references and keys them to the frozen receiving account', async () => {
    const h = setup('SUBMITTED');
    await h.service.receipt(platform, 'batch', {
      ...receipt,
      bankReference: '  bank-incoming-123  ',
    });
    expect(
      h.tx.earlyPayRepaymentReceipt.create.mock.calls[0][0].data,
    ).toMatchObject({
      destinationAccountId: 'destination',
      bankReference: 'BANK-INCOMING-123',
    });
  });
  it('receipt recorder cannot confirm their own evidence', async () => {
    const h = setup('SUBMITTED');
    await h.service.receipt(platform, 'batch', receipt);
    await expect(
      h.service.decideReceipt(platform, 'batch', 'receipt1', {
        ...auth,
        decision: 'CONFIRMED',
      }),
    ).rejects.toThrow('independent');
  });
  it('independent partial and final receipts reduce debt without changing payroll recovery status', async () => {
    const h = setup('SUBMITTED');
    await h.service.receipt(platform, 'batch', receipt);
    let b = await h.service.decideReceipt(platform2, 'batch', 'receipt1', {
      ...auth,
      decision: 'CONFIRMED',
    });
    expect(b.status).toBe('PARTIALLY_REPAID');
    expect(b.outstandingCents).toBe(5500);
    await h.service.receipt(platform, 'batch', {
      ...receipt,
      amountCents: 5500,
      bankReference: 'bank-incoming-456',
    });
    b = await h.service.decideReceipt(platform2, 'batch', 'receipt2', {
      ...auth,
      decision: 'CONFIRMED',
    });
    expect(b.status).toBe('REPAID');
    expect(b.outstandingCents).toBe(0);
    expect(h.tx.earlyPayRequest.updateMany).not.toHaveBeenCalled();
  });
  it('pending receipts reserve amounts against accidental over-recording', async () => {
    const h = setup('SUBMITTED');
    await h.service.receipt(platform, 'batch', receipt);
    await expect(
      h.service.receipt(platform, 'batch', {
        ...receipt,
        amountCents: 6000,
        bankReference: 'bank-other',
      }),
    ).rejects.toThrow('outstanding');
  });
  it('independent voiding frees reserved receipt amount without clearing recovery allocation', async () => {
    const h = setup('SUBMITTED');
    await h.service.receipt(platform, 'batch', receipt);
    const b = await h.service.decideReceipt(platform2, 'batch', 'receipt1', {
      ...auth,
      decision: 'VOIDED',
    });
    expect(b.pendingCents).toBe(0);
    expect(b.outstandingCents).toBe(10500);
    expect(h.item.activeRequestId).toBe('request');
  });
  it('rejects future receipt dates, empty evidence and fractional cents', async () => {
    const h = setup('SUBMITTED');
    await expect(
      h.service.receipt(platform, 'batch', {
        ...receipt,
        receivedAt: '2099-10-01',
      }),
    ).rejects.toThrow('future');
    await expect(
      h.service.receipt(platform, 'batch', {
        ...receipt,
        evidence: '          ',
      }),
    ).rejects.toThrow('evidence');
    await expect(
      h.service.receipt(platform, 'batch', { ...receipt, amountCents: 1.1 }),
    ).rejects.toThrow('integer');
  });
  it('cannot attach a foreign receipt ID or decide final results twice', async () => {
    const h = setup('SUBMITTED');
    await expect(
      h.service.decideReceipt(platform2, 'batch', 'foreign', {
        ...auth,
        decision: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await h.service.receipt(platform, 'batch', receipt);
    await h.service.decideReceipt(platform2, 'batch', 'receipt1', {
      ...auth,
      decision: 'CONFIRMED',
    });
    await expect(
      h.service.decideReceipt(platform2, 'batch', 'receipt1', {
        ...auth,
        decision: 'VOIDED',
      }),
    ).rejects.toThrow('already');
  });
  it('does not allow a receipt before employer submission', async () => {
    await expect(
      setup('APPROVED').service.receipt(platform, 'batch', receipt),
    ).rejects.toThrow('submitted');
  });
  it('confirmation cannot exceed the frozen debt even after inconsistent data', async () => {
    const h = setup('SUBMITTED');
    await h.service.receipt(platform, 'batch', receipt);
    h.batch.receipts.push({
      id: 'other',
      status: 'CONFIRMED',
      amountCents: 10000,
    });
    await expect(
      h.service.decideReceipt(platform2, 'batch', 'receipt1', {
        ...auth,
        decision: 'CONFIRMED',
      }),
    ).rejects.toThrow('exceed');
  });
});
describe('Repayment DTO and exact atomic payroll recovery links', () => {
  it('strict action DTO accepts only password/reason; rejects extra submission fields', async () => {
    expect(
      await validate(plainToInstance(RepaymentActionDto, auth), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(RepaymentActionDto, {
            ...auth,
            method: 'MANUAL_BANK_PORTAL',
          }),
          { whitelist: true, forbidNonWhitelisted: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('validates repayment UUID selections, period and receipt cents', async () => {
    expect(
      (
        await validate(
          plainToInstance(PrepareRepaymentDto, {
            ...preparation,
            ledgerEntryIds: [],
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(RecordRepaymentReceiptDto, {
            ...receipt,
            amountCents: 1.1,
          }),
        )
      ).some((e) => e.property === 'amountCents'),
    ).toBe(true);
  });
  it('marks only exact deduction sources recovered in the payroll transaction', async () => {
    const tx: any = {
      payrollRun: {
        update: jest.fn(async () => ({
          id: 'run',
          employeeId: 'employee',
          ledgerEntries: [
            {
              category: 'EARLY_PAY_RECOVERY',
              code: 'EARLY_PAY_RECOVERY',
              effect: 'EMPLOYEE_DEDUCTION',
              sourceType: 'EARLY_PAY_REQUEST',
              sourceId: 'deducted',
            },
            {
              category: 'OTHER_DEDUCTION',
              code: 'OTHER',
              sourceId: 'not-deducted',
            },
          ],
        })),
      },
      payrollRunStatusHistory: { create: jest.fn() },
      earlyPayRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    const db: any = {
      payrollSettings: {
        upsert: jest.fn(async () => ({ approvalMode: 'SINGLE_APPROVER' })),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      earlyPayRequest: { updateMany: jest.fn() },
    };
    const s = new PayrollService(db, {} as any);
    jest.spyOn(s, 'findOne').mockResolvedValue({
      id: 'run',
      status: 'PAYMENT_PROCESSING',
      employee: { id: 'employee', status: 'ACTIVE' },
      employeeId: 'employee',
    } as any);
    jest
      .spyOn(s as any, 'assertEmployeePayrollEligible')
      .mockResolvedValue(undefined);
    await s.updateStatus('org', 'run', { status: 'PAID' }, 'maker');
    expect(tx.earlyPayRequest.updateMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ['deducted'] },
      organizationId: 'org',
      employeeId: 'employee',
      status: 'PAID',
    });
    expect(db.earlyPayRequest.updateMany).not.toHaveBeenCalled();
  });
});
