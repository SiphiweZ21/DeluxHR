import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EarlyPayTreasuryService } from './treasury.service';
import { EarlyPayService } from '../early-pay/early-pay.service';
import { EarlyPayTreasuryController } from './treasury.controller';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PlatformRoleGuard } from '../../common/auth/platform-role.guard';
import {
  PreparePayoutDto,
  TreasuryActionDto,
  SubmitPayoutDto,
  PayoutResultDto,
} from './treasury.dto';
import type { PlatformJwtUser } from '../../common/auth/jwt-user.type';
jest.mock('../../common/auth/password', () => ({
  comparePassword: jest.fn(async (password: string) => password === 'correct'),
}));
const maker: PlatformJwtUser = {
  sub: 'maker',
  email: 'maker@test',
  role: 'PLATFORM_ADMIN',
  organizationId: null,
};
const checker: PlatformJwtUser = { ...maker, sub: 'checker' };
const action = {
  password: 'correct',
  reason: 'Verified supporting bank records',
};
const clone = (v: any) => JSON.parse(JSON.stringify(v));
function setup(status = 'PREPARED') {
  const funding: any = {
    id: 'funding',
    name: 'Treasury',
    bank: 'FNB',
    channel: 'Online Banking Enterprise',
    adapterId: 'FNB_OBE_BANKSERV',
    adapterVersion: '2023-02',
    accountHolder: 'DeluxHR',
    accountNumber: '123456789',
    branchCode: '250655',
    accountType: 'CURRENT',
    ownReference: 'EARLY PAY',
    status: 'APPROVED',
    createdBy: 'maker',
  };
  const item: any = {
    id: 'item',
    batchId: 'batch',
    requestId: 'request',
    activeRequestId: 'request',
    organizationId: 'org',
    employeeId: 'employee',
    employeeName: 'Alice Test',
    beneficiarySnapshot: {
      bankName: 'FNB',
      accountHolderName: 'ALICE TEST',
      accountNumber: '987654321',
      branchCode: '250655',
      accountType: 'CURRENT',
      employeeNumber: 'E1',
      transferType: 'STANDARD',
    },
    amountCents: 10000,
    paymentReference: 'EPABCDEFABCDEFABCDEF',
    status: 'PENDING',
  };
  const batch: any = {
    id: 'batch',
    status,
    fundingAccountId: 'funding',
    fundingSnapshot: { ...funding, profileId: 'funding' },
    paymentDate: new Date('2026-10-01'),
    currency: 'ZAR',
    totalCents: 10000,
    preparedBy: 'maker',
    approvedBy: status === 'PREPARED' ? null : 'checker',
    submittedBy: status === 'SUBMITTED' ? 'maker' : null,
    items: [item],
  };
  const request: any = {
    id: 'request',
    organizationId: 'org',
    employeeId: 'employee',
    status: 'PROCESSING',
    netDisbursement: 100,
    transferType: 'STANDARD',
    employee: {
      organizationId: 'org',
      status: 'ACTIVE',
      firstName: 'Alice',
      lastName: 'Test',
      employeeNumber: 'E1',
      paymentDetails: [
        {
          id: 'bankdetail',
          organizationId: 'org',
          status: 'APPROVED',
          bankName: 'FNB',
          accountHolderName: 'ALICE TEST',
          accountNumber: '987654321',
          branchCode: '250655',
          accountType: 'CURRENT',
        },
      ],
    },
    organization: { status: 'ACTIVE' },
  };
  const tx: any = {
    earlyPayRepaymentDestination: { findUnique: jest.fn(async () => null) },
    earlyPayRepaymentBatch: { count: jest.fn(async () => 0) },
    $queryRaw: jest.fn(async () => []),
    user: {
      findUnique: jest.fn(async () => ({
        isActive: true,
        organizationId: null,
        role: 'PLATFORM_ADMIN',
        passwordHash: 'hash',
      })),
    },
    platformFundingAccount: {
      findUnique: jest.fn(async () => clone(funding)),
      findMany: jest.fn(async () => [clone(funding)]),
      update: jest.fn(async ({ data }: any) => Object.assign(funding, data)),
      create: jest.fn(async ({ data }: any) => ({
        ...data,
        id: 'new-funding',
        status: 'PENDING_APPROVAL',
      })),
    },
    earlyPayPayoutBatch: {
      findUnique: jest.fn(async () => ({
        ...clone(batch),
        paymentDate: batch.paymentDate,
      })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      update: jest.fn(async ({ data }: any) => Object.assign(batch, data)),
      create: jest.fn(async ({ data }: any) => {
        Object.assign(batch, data);
        batch.items = data.items.create.map((i: any) => ({
          ...i,
          requestId: i.request.connect.id,
          batchId: batch.id,
          status: 'PENDING',
        }));
        return { ...clone(batch), paymentDate: data.paymentDate };
      }),
    },
    earlyPayPayoutItem: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          batch.items.find((i: any) => i.id === where.id),
          data,
        ),
      ),
      updateMany: jest.fn(async ({ data }: any) => {
        batch.items.forEach((i: any) => Object.assign(i, data));
        return { count: batch.items.length };
      }),
    },
    earlyPayRequest: {
      findUnique: jest.fn(async () => clone(request)),
      findMany: jest.fn(async () => [clone(request)]),
      update: jest.fn(async ({ data }: any) => Object.assign(request, data)),
      updateMany: jest.fn(async ({ data }: any) => {
        Object.assign(request, data);
        return { count: 1 };
      }),
    },
    organizationFeature: { count: jest.fn(async () => 2) },
    platformSubscription: { findUnique: jest.fn(async () => null) },
    platformAuditEvent: { create: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const db: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return {
    service: new EarlyPayTreasuryService(db),
    db,
    tx,
    batch,
    item,
    funding,
    request,
  };
}
describe('Early Pay treasury security and state transitions', () => {
  it('requires JWT and current platform account guards', () => {
    expect(
      Reflect.getMetadata('__guards__', EarlyPayTreasuryController),
    ).toEqual([JwtAuthGuard, PlatformRoleGuard]);
  });
  it('rejects tenant actors before reading treasury data', async () => {
    const h = setup();
    await expect(
      h.service.workspace({ ...maker, organizationId: 'org' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.tx.platformFundingAccount.findMany).not.toHaveBeenCalled();
  });
  it.each([
    { isActive: false, organizationId: null, role: 'PLATFORM_ADMIN' },
    { isActive: true, organizationId: 'org', role: 'PLATFORM_ADMIN' },
    { isActive: true, organizationId: null, role: 'COMPANY_ADMIN' },
  ])('revalidates current actor inside the transaction: %o', async (user) => {
    const h = setup();
    h.tx.user.findUnique.mockResolvedValue(user);
    await expect(
      h.service.approve(checker, 'batch', action),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.tx.earlyPayPayoutBatch.update).not.toHaveBeenCalled();
  });
  it('rejects wrong password without a mutation', async () => {
    const h = setup();
    await expect(
      h.service.approve(checker, 'batch', { ...action, password: 'wrong' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.tx.earlyPayPayoutBatch.update).not.toHaveBeenCalled();
  });
  it('does not allow a funding maker to approve their account', async () => {
    const h = setup();
    h.funding.status = 'PENDING_APPROVAL';
    await expect(
      h.service.reviewFunding(maker, 'funding', {
        ...action,
        decision: 'APPROVED',
      }),
    ).rejects.toThrow('Independent');
  });
  it('does not allow a maker to inspect their own pending funding account', async () => {
    const h = setup();
    h.funding.status = 'PENDING_APPROVAL';
    await expect(
      h.service.inspectFunding(maker, 'funding', action),
    ).rejects.toThrow('independent');
  });
  it('audits independent full-account inspection without changing approval', async () => {
    const h = setup();
    h.funding.status = 'PENDING_APPROVAL';
    const result = await h.service.inspectFunding(checker, 'funding', action);
    expect(result.accountNumber).toBe('123456789');
    expect(h.tx.platformAuditEvent.create).toHaveBeenCalled();
    expect(h.tx.platformFundingAccount.update).not.toHaveBeenCalled();
  });
  it('masks funding account review and list responses', async () => {
    const h = setup();
    h.funding.status = 'PENDING_APPROVAL';
    const result = await h.service.reviewFunding(checker, 'funding', {
      ...action,
      decision: 'APPROVED',
    });
    expect(result.accountNumber).toBeUndefined();
    expect(result.accountNumberMasked).toBe('••••6789');
    expect(JSON.stringify(await h.service.workspace(maker))).not.toContain(
      '123456789',
    );
  });
  it('blocks retirement while unsubmitted batches use the account', async () => {
    const h = setup();
    h.tx.earlyPayPayoutBatch.count.mockResolvedValue(1);
    await expect(
      h.service.retireFunding(checker, 'funding', action),
    ).rejects.toThrow('Cancel');
  });
  it('requires an independent batch release', async () => {
    const h = setup();
    await expect(h.service.approve(maker, 'batch', action)).rejects.toThrow(
      'Independent',
    );
    expect(h.tx.earlyPayPayoutBatch.update).not.toHaveBeenCalled();
  });
  it('records release without marking the request paid', async () => {
    const h = setup();
    const b = await h.service.approve(checker, 'batch', action);
    expect(b.status).toBe('APPROVED');
    expect(h.request.status).toBe('PROCESSING');
    expect(h.tx.earlyPayRequest.update).not.toHaveBeenCalled();
  });
  it('rechecks active employee/company/service eligibility at release', async () => {
    const h = setup();
    h.request.organization.status = 'SUSPENDED';
    await expect(h.service.approve(checker, 'batch', action)).rejects.toThrow(
      'active',
    );
  });
  it('prevents payout submission against a retired funding account', async () => {
    const h = setup('APPROVED');
    h.funding.status = 'RETIRED';
    await expect(
      h.service.submit(maker, 'batch', {
        ...action,
        method: 'MANUAL_BANK_PORTAL',
        bankReference: 'bank-1',
        evidence: 'bank accepted manual instruction',
      }),
    ).rejects.toThrow('no longer approved');
  });
  it('manual submission never marks money paid', async () => {
    const h = setup('APPROVED');
    await h.service.submit(maker, 'batch', {
      ...action,
      method: 'MANUAL_BANK_PORTAL',
      bankReference: 'bank-1',
      evidence: 'bank accepted manual instruction',
    });
    expect(h.batch.status).toBe('SUBMITTED');
    expect(h.request.status).toBe('PROCESSING');
    expect(h.tx.earlyPayRequest.update).not.toHaveBeenCalled();
  });
  it('cannot record draft upload as a bank submission', async () => {
    const h = setup('APPROVED');
    await expect(
      h.service.submit(maker, 'batch', {
        ...action,
        method: 'DRAFT' as any,
        bankReference: 'bank-1',
        evidence: 'draft file uploaded',
      }),
    ).rejects.toThrow('manual');
  });
  it('blocks paid results before bank submission', async () => {
    const h = setup('APPROVED');
    await expect(
      h.service.result(checker, 'batch', 'item', {
        ...action,
        outcome: 'PAID',
        bankReference: 'settled',
        evidence: 'settled on bank statement',
      }),
    ).rejects.toThrow('after submission');
    expect(h.tx.earlyPayRequest.update).not.toHaveBeenCalled();
  });
  it('submitter cannot confirm their own bank result', async () => {
    const h = setup('SUBMITTED');
    await expect(
      h.service.result(maker, 'batch', 'item', {
        ...action,
        outcome: 'PAID',
        bankReference: 'settled',
        evidence: 'settled on bank statement',
      }),
    ).rejects.toThrow('independent');
  });
  it('rejects foreign batch item IDs', async () => {
    const h = setup('SUBMITTED');
    await expect(
      h.service.result(checker, 'batch', 'foreign', {
        ...action,
        outcome: 'PAID',
        bankReference: 'settled',
        evidence: 'settled on bank statement',
      }),
    ).rejects.toThrow('not found');
  });
  it('paid confirmation updates the request and preserves a frozen allocation', async () => {
    const h = setup('SUBMITTED');
    await h.service.result(checker, 'batch', 'item', {
      ...action,
      outcome: 'PAID',
      bankReference: 'settled-1',
      evidence: 'settled on bank statement',
    });
    expect(h.request.status).toBe('PAID');
    expect(h.request.paymentReference).toBe('settled-1');
    expect(h.batch.status).toBe('RECONCILED');
    expect(h.item.activeRequestId).toBe('request');
    expect(h.tx.auditLog.create).toHaveBeenCalled();
  });
  it('failed confirmation never enables payroll recovery or automatically retries', async () => {
    const h = setup('SUBMITTED');
    await h.service.result(checker, 'batch', 'item', {
      ...action,
      outcome: 'FAILED',
      bankReference: 'rejected',
      evidence: 'bank final rejection record',
    });
    expect(h.request.status).toBe('PAYMENT_FAILED');
    expect(h.item.activeRequestId).toBe('request');
    expect(h.item.status).toBe('FAILED');
    expect(h.request.paidAt).toBeUndefined();
  });
  it('supports partial results without prematurely reconciling a batch', async () => {
    const h = setup('SUBMITTED');
    h.batch.items.push({
      ...clone(h.item),
      id: 'item2',
      requestId: 'request2',
    });
    await h.service.result(checker, 'batch', 'item', {
      ...action,
      outcome: 'PAID',
      bankReference: 'settled-1',
      evidence: 'settled on bank statement',
    });
    expect(h.batch.status).toBe('SUBMITTED');
  });
  it('identical confirmation is idempotent and a conflicting final result is blocked', async () => {
    const h = setup('SUBMITTED');
    const d = {
      ...action,
      outcome: 'PAID' as const,
      bankReference: 'settled-1',
      evidence: 'settled on bank statement',
    };
    await h.service.result(checker, 'batch', 'item', d);
    h.tx.earlyPayRequest.update.mockClear();
    await h.service.result(checker, 'batch', 'item', d);
    expect(h.tx.earlyPayRequest.update).not.toHaveBeenCalled();
    await expect(
      h.service.result(checker, 'batch', 'item', { ...d, outcome: 'FAILED' }),
    ).rejects.toThrow('cannot be changed');
  });
  it('pre-submission cancellation preserves history and releases request allocation', async () => {
    const h = setup();
    await h.service.cancel(maker, 'batch', action);
    expect(h.item.activeRequestId).toBeNull();
    expect(h.item.status).toBe('CANCELLED');
    expect(h.request.status).toBe('APPROVED');
    expect(h.batch.status).toBe('CANCELLED');
  });
  it('submitted batches cannot be cancelled to make duplicate payouts', async () => {
    const h = setup('SUBMITTED');
    await expect(h.service.cancel(maker, 'batch', action)).rejects.toThrow(
      'unsubmitted',
    );
    expect(h.tx.earlyPayPayoutItem.updateMany).not.toHaveBeenCalled();
  });
  it('masks batch funding and beneficiary details', async () => {
    const h = setup();
    const b = await h.service.detail(maker, 'batch');
    expect(b.fundingSnapshot).toBeUndefined();
    expect((b.items[0] as any).beneficiarySnapshot).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain('123456789');
    expect(JSON.stringify(b)).not.toContain('987654321');
  });
  it('full payout inspection requires release and records audit', async () => {
    const h = setup();
    await expect(
      h.service.inspectBatch(maker, 'batch', action),
    ).rejects.toThrow('released');
    h.batch.status = 'APPROVED';
    const b = await h.service.inspectBatch(maker, 'batch', action);
    expect((b.items[0].beneficiary as any).accountNumber).toBe('987654321');
    expect(h.tx.platformAuditEvent.create).toHaveBeenCalled();
  });
  it('draft download uses frozen details without moving a payment state', async () => {
    const h = setup('APPROVED');
    const f = await h.service.download(maker, 'batch', 'draft');
    expect(f.fileName).toMatch(/^DRAFT-NOT-FOR-BANK-UPLOAD-EARLY-PAY/);
    expect(f.sha256).toHaveLength(64);
    expect(h.batch.status).toBe('APPROVED');
    expect(h.tx.earlyPayPayoutBatch.update).not.toHaveBeenCalled();
    expect(h.tx.earlyPayRequest.update).not.toHaveBeenCalled();
  });
  it('masked reports prevent spreadsheet formula injection and do not contain full accounts', async () => {
    const h = setup('APPROVED');
    h.item.employeeName = '\t=HYPERLINK("bad")';
    const f = await h.service.download(maker, 'batch', 'report');
    expect(f.content.toString()).toContain("' =HYPERLINK");
    expect(f.content.toString()).not.toContain('987654321');
    expect(h.tx.earlyPayPayoutBatch.update).not.toHaveBeenCalled();
  });
  it('never offers unverified production payment files', () => {
    const h = setup();
    expect(() => h.service.productionExport()).toThrow('No verified');
  });
  it.each([0, -1, Infinity, NaN, 0.001, 21474836.48])(
    'rejects unsafe amount %s',
    (n) => {
      expect(() => setup().service.cents(n)).toThrow();
    },
  );
  it('uses integer cents for exact two-decimal amounts', () => {
    expect(setup().service.cents(10.29)).toBe(1029);
  });
});
describe('Early Pay treasury allocation', () => {
  const prepare = {
    fundingAccountId: 'funding',
    requestIds: ['request'],
    paymentDate: '2026-10-01',
    reason: 'Approved payout requests',
  };
  it('freezes funding, approved beneficiary, amount and references atomically', async () => {
    const h = setup();
    h.request.status = 'APPROVED';
    const b = await h.service.prepare(maker, prepare);
    expect(b.totalCents).toBe(10000);
    expect(h.request.status).toBe('PROCESSING');
    expect(
      h.tx.earlyPayPayoutBatch.create.mock.calls[0][0].data.fundingSnapshot
        .accountNumber,
    ).toBe('123456789');
    expect(
      h.tx.earlyPayPayoutBatch.create.mock.calls[0][0].data.items.create[0]
        .beneficiarySnapshot.accountNumber,
    ).toBe('987654321');
    expect(b.items[0].paymentReference).toMatch(/^EP[A-F0-9]{18}$/);
    expect(JSON.stringify(b)).not.toContain('987654321');
    expect(h.db.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'Serializable',
      timeout: 30000,
    });
  });
  it('blocks duplicate allocation before creating another batch', async () => {
    const h = setup();
    h.request.status = 'APPROVED';
    h.tx.earlyPayPayoutItem.findUnique.mockResolvedValue(h.item);
    await expect(h.service.prepare(maker, prepare)).rejects.toThrow(
      'already allocated',
    );
    expect(h.tx.earlyPayPayoutBatch.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate input IDs', async () => {
    await expect(
      setup().service.prepare(maker, {
        ...prepare,
        requestIds: ['request', 'request'],
      }),
    ).rejects.toThrow('distinct');
  });
  it.each(['PAID', 'PROCESSING', 'PENDING', 'RECOVERED'])(
    'rejects requests in %s state',
    async (status) => {
      const h = setup();
      h.request.status = status;
      await expect(h.service.prepare(maker, prepare)).rejects.toThrow(
        'approved',
      );
    },
  );
  it('requires approved current employee bank details', async () => {
    const h = setup();
    h.request.status = 'APPROVED';
    h.request.employee.paymentDetails = [];
    await expect(h.service.prepare(maker, prepare)).rejects.toThrow(
      'beneficiary',
    );
  });
  it('rejects disabled company services', async () => {
    const h = setup();
    h.request.status = 'APPROVED';
    h.tx.organizationFeature.count.mockResolvedValue(1);
    await expect(h.service.prepare(maker, prepare)).rejects.toThrow('enabled');
  });
  it('rejects expired or feature-excluding subscriptions', async () => {
    const h = setup();
    h.request.status = 'APPROVED';
    h.tx.platformSubscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      endsAt: null,
      package: { features: ['PAYROLL'] },
    });
    await expect(h.service.prepare(maker, prepare)).rejects.toThrow(
      'subscription',
    );
  });
  it('does not alter historical simulated paid requests', async () => {
    const h = setup();
    h.request.status = 'PAID';
    h.request.paymentReference = 'SIM-legacy';
    await expect(h.service.prepare(maker, prepare)).rejects.toThrow();
    expect(h.tx.earlyPayRequest.updateMany).not.toHaveBeenCalled();
  });
});
describe('Treasury DTO contracts and simulation removal', () => {
  it('rejects empty and excessive request selections', async () => {
    for (const requestIds of [[], Array(501).fill('not-uuid')])
      expect(
        (
          await validate(
            plainToInstance(PreparePayoutDto, {
              fundingAccountId: 'bad',
              requestIds,
              paymentDate: 'not-date',
              reason: 'ok',
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
  });
  it('rejects fake result outcomes and insufficient evidence', async () => {
    const errors = await validate(
      plainToInstance(PayoutResultDto, {
        ...action,
        outcome: 'ACCEPTED',
        bankReference: 'a',
        evidence: 'short',
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
  it('accepts the exact approval HTTP payload with strict whitelist', async () => {
    expect(
      await validate(plainToInstance(TreasuryActionDto, action), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
  });
  it('accepts manual bank submission only', async () => {
    const d = plainToInstance(SubmitPayoutDto, {
      ...action,
      method: 'BANK_FILE',
      bankReference: 'ref1',
      evidence: 'traceable bank instruction',
    });
    expect((await validate(d)).some((e) => e.property === 'method')).toBe(true);
  });
  it('the legacy payment endpoint fails without reading or changing requests', async () => {
    const db: any = {
      earlyPayRequest: { update: jest.fn(), findFirst: jest.fn() },
    };
    await expect(
      new EarlyPayService(db).processPayment('org', 'request'),
    ).rejects.toThrow('Simulated payments are disabled');
    expect(db.earlyPayRequest.update).not.toHaveBeenCalled();
    expect(db.earlyPayRequest.findFirst).not.toHaveBeenCalled();
  });
});
