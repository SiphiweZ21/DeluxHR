import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PayrollLedgerCategory,
  PayrollLedgerEffect,
  PayrollRunStatus,
} from '@prisma/client';
import {
  cents,
  periodBounds,
  PayrollLiabilitiesService,
} from './payroll-liabilities.service';
const actor = {
  sub: 'payroll-1',
  email: 'payroll@example.com',
  role: 'PAYROLL_ADMIN' as const,
  organizationId: 'org-1',
};
const ledger = (
  code: string,
  amount: number,
  category: PayrollLedgerCategory,
  effect: PayrollLedgerEffect,
  creditorName = 'SARS',
) => ({ code, amount, category, effect, creditorName, currency: 'ZAR' });
describe('Payroll liability register', () => {
  const db: any = {
    remittanceBatchAllocation: { findMany: jest.fn(async () => []) },
    companyOnboardingDocument: { findMany: jest.fn(async () => []) },
    payrollRun: { findMany: jest.fn() },
    payrollLiabilityAdjustment: { findMany: jest.fn() },
    payrollRemittancePayment: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new PayrollLiabilitiesService(db, {} as any);
  beforeEach(() => {
    jest.clearAllMocks();
    db.payrollLiabilityAdjustment.findMany.mockResolvedValue([]);
    db.payrollRemittancePayment.findMany.mockResolvedValue([]);
  });
  it('includes independently verified employer assessments by tenant/month without deducting employee pay', async () => {
    db.payrollRun.findMany.mockResolvedValue([]);
    db.companyOnboardingDocument.findMany.mockResolvedValueOnce([
      { category: 'COIDA_ASSESSMENT', assessmentAmount: '1234.56' },
      { category: 'PSIRA_FEE_ASSESSMENT', assessmentAmount: '100.00' },
    ]);
    const result = await service.register(actor, '2026-09');
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COIDA_ASSESSMENT',
          creditorName: 'Compensation Fund',
          amountCents: 123456,
          effect: 'EMPLOYER_LIABILITY',
        }),
        expect.objectContaining({
          code: 'PSIRA_FEES',
          creditorName: 'PSiRA',
          amountCents: 10000,
        }),
      ]),
    );
    expect(db.companyOnboardingDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          status: 'VERIFIED',
          liabilityPeriod: '2026-09',
        }),
      }),
    );
  });
  it('sums posted ledger in cents, excludes early pay recovery, and tracks confirmed payment', async () => {
    db.payrollRun.findMany.mockResolvedValue([
      {
        id: 'r1',
        currency: 'ZAR',
        grossEarnings: 1000,
        netPay: 760,
        totalEmployerCost: 1030,
        taxAmount: 200,
        uifEmployee: 10,
        uifEmployer: 10,
        sdlEmployer: 20,
        ledgerEntries: [
          ledger(
            'PAYE',
            200,
            PayrollLedgerCategory.STATUTORY_DEDUCTION,
            PayrollLedgerEffect.EMPLOYEE_DEDUCTION,
          ),
          ledger(
            'UIF_EMPLOYEE',
            10,
            PayrollLedgerCategory.STATUTORY_DEDUCTION,
            PayrollLedgerEffect.EMPLOYEE_DEDUCTION,
            'UIF',
          ),
          ledger(
            'UIF_EMPLOYER',
            10,
            PayrollLedgerCategory.EMPLOYER_STATUTORY,
            PayrollLedgerEffect.EMPLOYER_LIABILITY,
            'UIF',
          ),
          ledger(
            'SDL_EMPLOYER',
            20,
            PayrollLedgerCategory.EMPLOYER_STATUTORY,
            PayrollLedgerEffect.EMPLOYER_LIABILITY,
          ),
          ledger(
            'EARLY_PAY_RECOVERY',
            40,
            PayrollLedgerCategory.EARLY_PAY_RECOVERY,
            PayrollLedgerEffect.EMPLOYEE_DEDUCTION,
          ),
        ],
      },
    ]);
    db.payrollLiabilityAdjustment.findMany.mockResolvedValue([
      { code: 'PAYE', creditorName: 'SARS', amountCents: -500 },
    ]);
    db.payrollRemittancePayment.findMany.mockResolvedValue([
      {
        code: 'PAYE',
        creditorName: 'SARS',
        amountCents: 10000,
        status: 'CONFIRMED',
      },
      {
        code: 'PAYE',
        creditorName: 'SARS',
        amountCents: 2500,
        status: 'RECORDED',
      },
    ]);
    const result = await service.register(actor as any, '2026-09');
    expect(result.runCount).toBe(1);
    expect(result.statutory).toEqual({
      payeCents: 19500,
      uifEmployeeCents: 1000,
      uifEmployerCents: 1000,
      uifTotalCents: 2000,
      sdlCents: 2000,
    });
    expect(result.totals).toEqual({
      reservedCents: 0,
      availableCents: 11000,
      baseCents: 24000,
      adjustmentCents: -500,
      paidCents: 10000,
      pendingCents: 2500,
      outstandingCents: 13500,
    });
    expect(result.rows.some((row) => row.code === 'EARLY_PAY_RECOVERY')).toBe(
      false,
    );
    expect(db.payrollRun.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      status: {
        in: [
          PayrollRunStatus.LOCKED,
          PayrollRunStatus.PAYMENT_PROCESSING,
          PayrollRunStatus.PAID,
        ],
      },
    });
  });
  it('rejects mixed currencies and malformed periods', async () => {
    db.payrollRun.findMany.mockResolvedValue([
      { currency: 'USD', ledgerEntries: [] },
    ]);
    await expect(
      service.register(actor as any, '2026-09'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(() => periodBounds('2026-13')).toThrow(BadRequestException);
    expect(cents(0.1 + 0.2)).toBe(30);
  });
  it('escapes creditor formulas in CSV while preserving negative numeric amounts', async () => {
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const reporting = new PayrollLiabilitiesService(db, audit as any);
    jest.spyOn(reporting, 'register').mockResolvedValue({
      period: '2026-09',
      rows: [
        {
          code: 'PAYE',
          creditorName: '=HYPERLINK("https://example.invalid")',
          category: 'STATUTORY_DEDUCTION',
          effect: 'EMPLOYEE_DEDUCTION',
          amountCents: 10000,
          adjustmentCents: -500,
          paidCents: 0,
          outstandingCents: 9500,
          status: 'UNPAID',
        },
      ],
    } as any);
    const csv = await reporting.csv(actor as any, '2026-09');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('\"-5.00\"');
    expect(audit.log).toHaveBeenCalled();
  });
  it('prevents a second payment decision', async () => {
    db.$transaction.mockImplementation((fn: any) =>
      fn({
        $queryRaw: jest.fn(async () => []),
        payrollRemittancePayment: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'p1', status: 'CONFIRMED' }),
        },
      }),
    );
    await expect(
      service.decide(actor as any, 'p1', 'VOIDED', 'Duplicate payment'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('External remittances coexist with preparation reservations', () => {
  const row = {
    code: 'PENSION',
    creditorName: 'Fund',
    amountCents: 10000,
    adjustmentCents: 0,
    paidCents: 0,
    pendingCents: 1000,
    reservedCents: 6000,
    outstandingCents: 10000,
    availableCents: 3000,
  };
  function setup() {
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      remittancePaymentBatch: { findFirst: jest.fn(async () => null) },
      payrollRemittancePayment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => data),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: jest.fn(async () => ({ status: 'CONFIRMED' })),
      },
      payrollLiabilityAdjustment: { create: jest.fn() },
    };
    const db: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) },
      audit: any = { log: jest.fn(async () => {}) },
      s = new PayrollLiabilitiesService(db, audit);
    jest.spyOn(s, 'register').mockResolvedValue({ rows: [row] } as any);
    return { s, tx, db };
  }
  const dto = {
    period: '2026-09',
    code: 'PENSION',
    creditorName: 'Fund',
    amountCents: 3001,
    reference: 'bank-123',
    paidAt: '2026-09-01',
  };
  it('refuses external records that would consume amounts held in batches or pending accounting', async () => {
    const x = setup();
    await expect(x.s.payment(actor, dto)).rejects.toThrow('unreserved');
    expect(x.tx.payrollRemittancePayment.create).not.toHaveBeenCalled();
    expect(x.tx.$queryRaw).toHaveBeenCalled();
  });
  it('accepts only available funds and checks both result reference and legacy reference reuse', async () => {
    const x = setup();
    await x.s.payment(actor, { ...dto, amountCents: 3000 });
    expect(x.tx.payrollRemittancePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountCents: 3000,
        reference: 'BANK-123',
      }),
    });
    const y = setup();
    y.tx.remittancePaymentBatch.findFirst.mockResolvedValue({ id: 'batch' });
    await expect(
      y.s.payment(actor, { ...dto, amountCents: 3000 }),
    ).rejects.toThrow('remittance batch');
    const z = setup();
    z.tx.payrollRemittancePayment.findFirst.mockResolvedValue({ id: 'old' });
    await expect(
      z.s.payment(actor, { ...dto, amountCents: 3000 }),
    ).rejects.toThrow('already exists');
  });
  it('prevents adjustments that reduce the liability below reserved and pending amounts', async () => {
    const x = setup();
    await expect(
      x.s.adjustment(actor, {
        period: '2026-09',
        code: 'PENSION',
        creditorName: 'Fund',
        amountCents: -4000,
        reason: 'Reviewed adjustment',
      }),
    ).rejects.toThrow('reserved');
    expect(x.tx.payrollLiabilityAdjustment.create).not.toHaveBeenCalled();
  });
  it('requires a different user and a substantive reason for confirmation and voiding', async () => {
    for (const status of ['CONFIRMED', 'VOIDED']) {
      const x = setup();
      x.tx.payrollRemittancePayment.findFirst.mockResolvedValue({
        id: 'payment',
        status: 'RECORDED',
        createdByUserId: actor.sub,
      });
      await expect(
        x.s.decide(actor, 'payment', status, 'Checked payment'),
      ).rejects.toThrow('different user');
      const y = setup();
      y.tx.payrollRemittancePayment.findFirst.mockResolvedValue({
        id: 'payment',
        status: 'RECORDED',
        createdByUserId: 'other',
      });
      await expect(y.s.decide(actor, 'payment', status)).rejects.toThrow(
        '8 characters',
      );
      expect(y.tx.payrollRemittancePayment.updateMany).not.toHaveBeenCalled();
    }
  });
  it('prevents confirmation from clearing reserved liability', async () => {
    const x = setup();
    x.tx.payrollRemittancePayment.findFirst.mockResolvedValue({
      ...dto,
      id: 'payment',
      status: 'RECORDED',
      createdByUserId: 'other',
      amountCents: 5000,
    });
    await expect(
      x.s.decide(actor, 'payment', 'CONFIRMED', 'Bank statement checked'),
    ).rejects.toThrow('reserved');
    expect(x.tx.payrollRemittancePayment.updateMany).not.toHaveBeenCalled();
  });
  it('register separates outstanding from reserved and available, retaining failed and exception reservations', async () => {
    const db: any = {
      companyOnboardingDocument: { findMany: jest.fn(async () => []) },
      payrollRun: {
        findMany: jest.fn(async () => [
          {
            currency: 'ZAR',
            grossEarnings: 100,
            netPay: 90,
            totalEmployerCost: 100,
            ledgerEntries: [
              {
                code: 'PENSION',
                creditorName: 'Fund',
                category: 'BENEFIT_DEDUCTION',
                effect: 'EMPLOYEE_DEDUCTION',
                currency: 'ZAR',
                amount: 100,
              },
            ],
          },
        ]),
      },
      payrollLiabilityAdjustment: { findMany: jest.fn(async () => []) },
      payrollRemittancePayment: {
        findMany: jest.fn(async () => [
          {
            code: 'PENSION',
            creditorName: 'Fund',
            amountCents: 1000,
            status: 'RECORDED',
          },
        ]),
      },
      remittanceBatchAllocation: {
        findMany: jest.fn(async () => [
          { code: 'PENSION', creditorName: 'Fund', amountCents: 6000 },
        ]),
      },
    };
    const s = new PayrollLiabilitiesService(db, {} as any),
      r = await s.register(actor, '2026-09');
    expect(r.rows[0]).toMatchObject({
      outstandingCents: 10000,
      pendingCents: 1000,
      reservedCents: 6000,
      availableCents: 3000,
    });
    expect(db.remittanceBatchAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batch: {
            organizationId: actor.organizationId,
            period: '2026-09',
            status: { notIn: ['PAID', 'CANCELLED'] },
          },
        },
      }),
    );
  });
});
