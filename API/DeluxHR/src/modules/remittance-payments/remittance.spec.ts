import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RemittancePaymentsService } from './remittance.service';
import {
  RemittanceBeneficiariesController,
  RemittancePaymentsController,
} from './remittance.controller';
import {
  CreateBeneficiaryDto,
  PrepareRemittanceDto,
  RemittanceResultDto,
} from './remittance.dto';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/access/require-permissions.decorator';
import { OrganizationPermissionsGuard } from '../../common/access/organization-permissions.guard';
import type { TenantJwtUser } from '../../common/auth/jwt-user.type';
jest.mock('../../common/auth/password', () => ({
  comparePassword: jest.fn(async (p: string) => p === 'correct'),
}));
const maker: TenantJwtUser = {
    sub: 'maker',
    organizationId: 'org',
    role: 'COMPANY_ADMIN',
    email: 'maker@test',
  },
  checker: TenantJwtUser = { ...maker, sub: 'checker' },
  submitter: TenantJwtUser = { ...maker, sub: 'submitter' };
const auth = {
  password: 'correct',
  reason: 'Verified bank evidence and payment instructions',
};
const row = (code = 'PENSION', amount = 10000, creditor = 'Pension Fund') => ({
  code,
  creditorName: creditor,
  category: code === 'PENSION' ? 'BENEFIT_DEDUCTION' : 'STATUTORY_DEDUCTION',
  effect: 'EMPLOYEE_DEDUCTION',
  amountCents: amount,
  adjustmentCents: 0,
  paidCents: 0,
  pendingCents: 0,
  outstandingCents: amount,
  reservedCents: 0,
  availableCents: amount,
  status: 'UNPAID',
});
function setup(status = 'PREPARED', route = 'BANK_TRANSFER') {
  const profile: any = {
    id: 'profile',
    organizationId: 'org',
    name: 'Pension Fund',
    route,
    code: route === 'BANK_TRANSFER' ? 'PENSION' : null,
    creditorName: route === 'BANK_TRANSFER' ? 'Pension Fund' : null,
    payeeReference: route === 'BANK_TRANSFER' ? 'PENSION SEP' : null,
    bankName: 'FNB',
    accountHolder: 'PENSION FUND',
    accountNumber: '987654321',
    branchCode: '250655',
    accountType: 'CURRENT',
    uifViaSars: true,
    registrationEvidence: 'Registration document checked',
    status: 'APPROVED',
    createdBy: 'maker',
  };
  const funding: any = {
    id: 'funding',
    organizationId: 'org',
    name: 'Company',
    bank: 'FNB',
    adapterId: 'FNB_OBE_BANKSERV',
    adapterVersion: '2023-02',
    currency: 'ZAR',
    accountNumber: '123456789',
    branchCode: '250655',
    ownReference: 'REMITTANCES',
    status: 'APPROVED',
  };
  const batch: any = {
    id: 'batch',
    organizationId: 'org',
    period: '2026-09',
    beneficiaryId: 'profile',
    fundingProfileId: 'funding',
    route,
    fundingSnapshot: { ...funding, profileId: funding.id },
    beneficiarySnapshot: { ...profile },
    paymentDate: new Date('2026-09-30'),
    paymentReference:
      route === 'BANK_TRANSFER' ? 'PENSION SEP' : '1234567890123456789',
    totalCents: 10000,
    status,
    preparedBy: 'maker',
    submittedBy: 'submitter',
    allocations: [
      {
        id: 'allocation',
        code: 'PENSION',
        creditorName: 'Pension Fund',
        amountCents: 10000,
      },
    ],
  };
  const tx: any = {
    $queryRaw: jest.fn(async () => []),
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({
        id: where.id,
        organizationId: 'org',
        role: 'COMPANY_ADMIN',
        isActive: true,
        passwordHash: 'hash',
      })),
    },
    organization: { findUnique: jest.fn(async () => ({ status: 'ACTIVE' })) },
    organizationFeature: {
      findUnique: jest.fn(async () => ({ enabled: true })),
    },
    platformSubscription: { findUnique: jest.fn(async () => null) },
    remittanceBeneficiary: {
      findFirst: jest.fn(async () => profile),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({
        ...data,
        id: 'new-profile',
        status: 'PENDING_APPROVAL',
      })),
      update: jest.fn(async ({ data }: any) => Object.assign(profile, data)),
    },
    companyBankingDefault: {
      findUnique: jest.fn(async () => ({ profileId: 'funding' })),
    },
    companyBankingProfile: { findFirst: jest.fn(async () => funding) },
    remittancePaymentBatch: {
      findFirst: jest.fn(async () => batch),
      findMany: jest.fn(async () => [batch]),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) =>
        Object.assign(batch, {
          ...data,
          id: 'batch',
          allocations: data.allocations.create.map((r: any, i: number) => ({
            ...r,
            id: 'a' + i,
          })),
        }),
      ),
      update: jest.fn(async ({ data }: any) => Object.assign(batch, data)),
    },
    payrollRemittancePayment: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => data),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const db: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) },
    access: any = {
      getEffectivePermissions: jest.fn(async () =>
        [
          Permission.PREPARE_PAYROLL_PAYMENTS,
          Permission.APPROVE_PAYROLL_PAYMENTS,
          Permission.EXPORT_PAYROLL_PAYMENTS,
        ].map((permission) => ({ permission, scope: 'ORGANIZATION' })),
      ),
    },
    liabilities: any = { register: jest.fn(async () => ({ rows: [row()] })) };
  return {
    service: new RemittancePaymentsService(db, access, liabilities),
    db,
    tx,
    access,
    liabilities,
    batch,
    profile,
    funding,
  };
}
const prepare = {
  period: '2026-09',
  beneficiaryId: 'profile',
  paymentDate: '2026-09-30',
  reason: auth.reason,
};
const result = {
  ...auth,
  outcome: 'PAID' as const,
  actualPaidCents: 10000,
  paidAt: '2026-09-01',
  bankReference: 'bank-123',
  evidence: 'Bank statement verified entry 12',
};
describe('Remittance preparation and statutory routing', () => {
  it('freezes approved beneficiary, funding and partial unreserved allocation; masks accounts', async () => {
    const x = setup();
    const b = await x.service.prepare(maker, { ...prepare, amountCents: 4000 });
    expect(b.totalCents).toBe(4000);
    expect(b.allocations).toEqual([
      expect.objectContaining({ code: 'PENSION', amountCents: 4000 }),
    ]);
    expect(JSON.stringify(b)).not.toContain('987654321');
    expect(JSON.stringify(b)).not.toContain('123456789');
    expect(x.batch.beneficiarySnapshot.accountNumber).toBe('987654321');
    expect(x.liabilities.register).toHaveBeenCalledWith(maker, '2026-09', x.tx);
    expect(x.db.$transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: 'Serializable',
    });
  });
  it('rejects amount above remaining unreserved funds', async () => {
    const x = setup();
    x.liabilities.register.mockResolvedValue({
      rows: [{ ...row(), reservedCents: 6000, availableCents: 4000 }],
    });
    await expect(
      x.service.prepare(maker, { ...prepare, amountCents: 5000 }),
    ).rejects.toThrow('unreserved');
    expect(x.tx.remittancePaymentBatch.create).not.toHaveBeenCalled();
  });
  it('ordinary routes reject statutory and Early Pay liability buckets', async () => {
    for (const code of ['PAYE', 'EARLY_PAY_RECOVERY']) {
      const x = setup();
      x.profile.code = code;
      x.profile.creditorName = 'SARS';
      x.liabilities.register.mockResolvedValue({
        rows: [row(code, 10000, 'SARS')],
      });
      await expect(x.service.prepare(maker, prepare)).rejects.toThrow(
        'No matching',
      );
    }
  });
  it('uses exact creditor and approved same-company funding', async () => {
    const x = setup();
    x.profile.creditorName = 'Other Fund';
    await expect(x.service.prepare(maker, prepare)).rejects.toThrow(
      'No matching',
    );
    x.profile.creditorName = 'Pension Fund';
    x.tx.companyBankingProfile.findFirst.mockResolvedValue(null);
    await expect(x.service.prepare(maker, prepare)).rejects.toThrow(
      'same-company',
    );
  });
  it('groups SARS PAYE SDL and UIF using official 19-digit PRN and reconciled declaration', async () => {
    const x = setup('PREPARED', 'SARS_EFILING');
    x.liabilities.register.mockResolvedValue({
      rows: [
        row('PAYE', 10000, 'SARS'),
        row('SDL_EMPLOYER', 1000, 'SARS'),
        row('UIF_EMPLOYEE', 500, 'UIF'),
        row('UIF_EMPLOYER', 500, 'UIF'),
        row('PENSION', 5000),
      ],
    });
    const b = await x.service.prepare(maker, {
      ...prepare,
      officialReference: '1234567890123456789',
      declaredPaymentCents: 12000,
      declarationEvidence: 'EMP201 declaration verified',
    });
    expect(b.totalCents).toBe(12000);
    expect(b.allocations.map((a) => a.code).sort()).toEqual([
      'PAYE',
      'SDL_EMPLOYER',
      'UIF_EMPLOYEE',
      'UIF_EMPLOYER',
    ]);
  });
  it.each(['not-a-prn', '123456789012345678', '12345678901234567890'])(
    'rejects unofficial SARS PRN %s',
    async (ref) => {
      const x = setup('PREPARED', 'SARS_EFILING');
      x.liabilities.register.mockResolvedValue({
        rows: [row('PAYE', 10000, 'SARS')],
      });
      await expect(
        x.service.prepare(maker, {
          ...prepare,
          officialReference: ref,
          declaredPaymentCents: 10000,
          declarationEvidence: 'EMP201 verified declaration',
        }),
      ).rejects.toThrow('19-digit');
    },
  );
  it('rejects mismatched declaration amount and pending statutory remittances', async () => {
    const x = setup('PREPARED', 'SARS_EFILING');
    x.liabilities.register.mockResolvedValue({
      rows: [row('PAYE', 10000, 'SARS')],
    });
    const d = {
      ...prepare,
      officialReference: '1234567890123456789',
      declaredPaymentCents: 9999,
      declarationEvidence: 'EMP201 verified declaration',
    };
    await expect(x.service.prepare(maker, d)).rejects.toThrow(
      'reconcile exactly',
    );
    x.liabilities.register.mockResolvedValue({
      rows: [
        {
          ...row('PAYE', 10000, 'SARS'),
          pendingCents: 500,
          availableCents: 9500,
        },
      ],
    });
    await expect(
      x.service.prepare(maker, { ...d, declaredPaymentCents: 9500 }),
    ).rejects.toThrow('Resolve reserved');
  });
  it('direct UIF selects UIF only; SARS without UIF excludes UIF', async () => {
    for (const route of ['UIF_PORTAL', 'SARS_EFILING']) {
      const x = setup('PREPARED', route);
      x.profile.uifViaSars = false;
      x.liabilities.register.mockResolvedValue({
        rows: [
          row('PAYE', 10000, 'SARS'),
          row('UIF_EMPLOYEE', 500, 'UIF'),
          row('UIF_EMPLOYER', 500, 'UIF'),
        ],
      });
      const b = await x.service.prepare(maker, {
        ...prepare,
        officialReference:
          route === 'SARS_EFILING' ? '1234567890123456789' : 'UIF-DECLARATION',
        declaredPaymentCents: route === 'UIF_PORTAL' ? 1000 : 10000,
        declarationEvidence: 'Declaration payment checked',
      });
      expect(b.allocations.map((a) => a.code)).toEqual(
        route === 'UIF_PORTAL' ? ['UIF_EMPLOYEE', 'UIF_EMPLOYER'] : ['PAYE'],
      );
    }
  });
  it('prohibits ordinary bank fields on statutory profiles and direct UIF via SARS', async () => {
    const x = setup();
    await expect(
      x.service.create(maker, {
        name: 'SARS',
        route: 'SARS_EFILING',
        accountNumber: '123456789',
        uifViaSars: true,
        registrationEvidence: 'Registration checked',
        reason: auth.reason,
      }),
    ).rejects.toThrow('cannot contain');
    await expect(
      x.service.create(maker, {
        name: 'UIF',
        route: 'UIF_PORTAL',
        uifViaSars: true,
        registrationEvidence: 'Registration checked',
        reason: auth.reason,
      }),
    ).rejects.toThrow('must use SARS');
  });
  it('prevents self beneficiary approval and conflicting UIF route approval', async () => {
    const x = setup('PREPARED', 'UIF_PORTAL');
    x.profile.status = 'PENDING_APPROVAL';
    await expect(
      x.service.review(maker, 'profile', { ...auth, decision: 'APPROVED' }),
    ).rejects.toThrow('Independent');
    x.tx.remittanceBeneficiary.findMany.mockResolvedValue([
      { route: 'SARS_EFILING', uifViaSars: true },
    ]);
    await expect(
      x.service.review(checker, 'profile', { ...auth, decision: 'APPROVED' }),
    ).rejects.toThrow('both SARS');
  });
  it('permits pending company setup but refuses pending company financial actions', async () => {
    const x = setup();
    x.tx.organization.findUnique.mockResolvedValue({ status: 'PENDING' });
    const p = await x.service.create(maker, {
      name: 'SARS',
      route: 'SARS_EFILING',
      uifViaSars: true,
      registrationEvidence: 'Registration checked',
      reason: auth.reason,
    });
    expect(p.status).toBe('PENDING_APPROVAL');
    await expect(x.service.prepare(maker, prepare)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('blocks retirement when batches are unsubmitted', async () => {
    const x = setup();
    x.tx.remittancePaymentBatch.count.mockResolvedValue(1);
    await expect(x.service.retire(checker, 'profile', auth)).rejects.toThrow(
      'Cancel unsubmitted',
    );
  });
  it('prevents self release and requires current entitlement and organization grant', async () => {
    const x = setup();
    await expect(x.service.approve(maker, 'batch', auth)).rejects.toThrow(
      'Independent release',
    );
    x.access.getEffectivePermissions.mockResolvedValue([
      { permission: Permission.APPROVE_PAYROLL_PAYMENTS, scope: 'SELF' },
    ]);
    await expect(
      x.service.approve(checker, 'batch', auth),
    ).rejects.toBeInstanceOf(ForbiddenException);
    x.access.getEffectivePermissions.mockResolvedValue([
      {
        permission: Permission.APPROVE_PAYROLL_PAYMENTS,
        scope: 'ORGANIZATION',
      },
    ]);
    x.tx.organizationFeature.findUnique.mockResolvedValue({ enabled: false });
    await expect(x.service.approve(checker, 'batch', auth)).rejects.toThrow(
      'unavailable',
    );
  });
  it('rechecks active actor role and organization; isolates foreign batch ids', async () => {
    const x = setup('APPROVED');
    x.tx.user.findUnique.mockResolvedValue({
      isActive: false,
      role: 'COMPANY_ADMIN',
      organizationId: 'org',
    });
    await expect(
      x.service.submit(checker, 'batch', {
        ...auth,
        method: 'MANUAL_BANK_PORTAL',
        bankReference: 'entry',
        evidence: 'Evidence verified',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const y = setup();
    y.tx.remittancePaymentBatch.findFirst.mockResolvedValue(null);
    await expect(y.service.detail(checker, 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(y.tx.remittancePaymentBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'foreign', organizationId: 'org' },
      }),
    );
  });
  it('requires official portal submission method; does not create accounting payment on submit', async () => {
    const x = setup('APPROVED', 'SARS_EFILING');
    await expect(
      x.service.submit(submitter, 'batch', {
        ...auth,
        method: 'MANUAL_BANK_PORTAL',
        bankReference: 'bank-1',
        evidence: 'Verified portal instruction',
      }),
    ).rejects.toThrow('official statutory');
    await x.service.submit(submitter, 'batch', {
      ...auth,
      method: 'SARS_EFILING',
      bankReference: 'bank-1',
      evidence: 'Verified portal instruction',
    });
    expect(x.batch.status).toBe('SUBMITTED');
    expect(x.tx.payrollRemittancePayment.create).not.toHaveBeenCalled();
  });
  it('requires independent bank result; rejects overpaid or partial amounts classified as full payment', async () => {
    const x = setup('SUBMITTED');
    await expect(x.service.result(maker, 'batch', result)).rejects.toThrow(
      'Independent bank-result',
    );
    await expect(x.service.result(submitter, 'batch', result)).rejects.toThrow(
      'Independent bank-result',
    );
    await expect(
      x.service.result(checker, 'batch', { ...result, actualPaidCents: 9000 }),
    ).rejects.toThrow('Paid must equal');
    expect(x.tx.payrollRemittancePayment.create).not.toHaveBeenCalled();
  });
  it('creates exact linked confirmed allocation entries once on paid result and replays idempotently', async () => {
    const x = setup('SUBMITTED');
    x.batch.allocations = [
      { id: 'a1', code: 'PAYE', creditorName: 'SARS', amountCents: 8000 },
      {
        id: 'a2',
        code: 'SDL_EMPLOYER',
        creditorName: 'SARS',
        amountCents: 2000,
      },
    ];
    await x.service.result(checker, 'batch', result);
    expect(x.tx.payrollRemittancePayment.create).toHaveBeenCalledTimes(2);
    expect(
      x.tx.payrollRemittancePayment.create.mock.calls.map(
        (c: any) => c[0].data.amountCents,
      ),
    ).toEqual([8000, 2000]);
    expect(
      x.tx.payrollRemittancePayment.create.mock.calls[0][0].data,
    ).toMatchObject({
      organizationId: 'org',
      status: 'CONFIRMED',
      createdByUserId: 'submitter',
      confirmedByUserId: 'checker',
      batchAllocationId: 'a1',
    });
    await x.service.result(checker, 'batch', result);
    expect(x.tx.payrollRemittancePayment.create).toHaveBeenCalledTimes(2);
    await expect(
      x.service.result(checker, 'batch', { ...result, paidAt: '2026-09-02' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([
    ['FAILED', 0, 'FAILED'],
    ['MISMATCH', 5000, 'EXCEPTION'],
  ])(
    'holds %s without confirmed accounting entries',
    async (outcome, amount, status) => {
      const x = setup('SUBMITTED');
      await x.service.result(checker, 'batch', {
        ...result,
        outcome: outcome as any,
        actualPaidCents: amount as number,
      });
      expect(x.batch.status).toBe(status);
      expect(x.tx.payrollRemittancePayment.create).not.toHaveBeenCalled();
      await expect(x.service.cancel(maker, 'batch', auth)).rejects.toThrow(
        'unsubmitted',
      );
    },
  );
  it('rejects references already used in external accounting and invalid actual cents', async () => {
    const x = setup('SUBMITTED');
    x.tx.payrollRemittancePayment.findFirst.mockResolvedValue({
      id: 'old-payment',
    });
    await expect(
      x.service.result(checker, 'batch', result),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      x.service.result(checker, 'batch', { ...result, actualPaidCents: NaN }),
    ).rejects.toThrow('Valid actual');
    expect(x.tx.remittancePaymentBatch.update).not.toHaveBeenCalled();
  });
  it('requires password and does not expose bank details before release', async () => {
    const x = setup();
    await expect(
      x.service.inspect(checker, 'batch', { ...auth, password: 'bad' }),
    ).rejects.toThrow('Password');
    await expect(x.service.inspect(checker, 'batch', auth)).rejects.toThrow(
      'Release required',
    );
  });
  it('statutory draft blocked; report formula safe and does not change status or mark paid', async () => {
    const x = setup('APPROVED', 'SARS_EFILING');
    await expect(x.service.download(checker, 'batch', 'draft')).rejects.toThrow(
      'official portal',
    );
    x.batch.allocations[0].creditorName = '=FORMULA()';
    const f = await x.service.download(checker, 'batch', 'report');
    expect(f.content.toString()).toContain("'=FORMULA()");
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(x.tx.remittancePaymentBatch.update).not.toHaveBeenCalled();
    expect(x.tx.payrollRemittancePayment.create).not.toHaveBeenCalled();
    expect(() => x.service.productionExport()).toThrow('No verified');
  });
  it('generates one aggregated ordinary FNB test instruction without payment state change', async () => {
    const x = setup('APPROVED');
    const f = await x.service.download(checker, 'batch', 'draft');
    expect(f.fileName).toContain('DRAFT-NOT-FOR-BANK-UPLOAD');
    expect(
      f.content
        .toString()
        .split('\r\n')
        .filter((r) => r.startsWith('10')),
    ).toHaveLength(1);
    expect(x.tx.remittancePaymentBatch.update).not.toHaveBeenCalled();
    expect(x.tx.payrollRemittancePayment.create).not.toHaveBeenCalled();
  });
  it('maps unique/reference and serialization races to a refreshable conflict', async () => {
    const x = setup();
    x.db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('race', {
        code: 'P2034',
        clientVersion: '7.5.0',
      }),
    );
    await expect(x.service.prepare(maker, prepare)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('financial controller uses organization permissions and declared action grants; config has separate pending access', () => {
    expect(
      Reflect.getMetadata('__guards__', RemittancePaymentsController),
    ).toContain(OrganizationPermissionsGuard);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        RemittancePaymentsController.prototype.prepare,
      ),
    ).toEqual([Permission.PREPARE_PAYROLL_PAYMENTS]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        RemittancePaymentsController.prototype.result,
      ),
    ).toEqual([Permission.APPROVE_PAYROLL_PAYMENTS]);
    expect(
      Reflect.getMetadata(
        'allow_pending_onboarding',
        RemittanceBeneficiariesController,
      ),
    ).toBe(true);
  });
  it('validates cents as integers and rejects client-injected payment state / stray approval fields', async () => {
    const opts = { whitelist: true, forbidNonWhitelisted: true };
    const valid = {
      ...prepare,
      beneficiaryId: '00000000-0000-4000-8000-000000000001',
    };
    expect(
      await validate(plainToInstance(PrepareRemittanceDto, valid), opts),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(PrepareRemittanceDto, { ...valid, status: 'PAID' }),
          opts,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(RemittanceResultDto, {
            ...result,
            actualPaidCents: 1.5,
          }),
          opts,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(CreateBeneficiaryDto, {
            name: 'Fund',
            route: 'BANK_TRANSFER',
            payeeReference: 'reference too long to upload',
            reason: 'Valid reason',
          }),
          opts,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('Authority assessment remittance matching', () => {
  it.each([['COIDA_ASSESSMENT', 'Compensation Fund'], ['PSIRA_FEES', 'PSiRA']])('matches %s only to the exact approved bank-transfer beneficiary', (code, creditorName) => {
    const x = setup();
    const assessment = {...row(code,123456,creditorName),category:'AUTHORITY_ASSESSMENT',effect:'EMPLOYER_LIABILITY'};
    const target = (x.service as any).target.bind(x.service);
    expect(target({route:'BANK_TRANSFER',code,creditorName},[assessment])).toEqual([assessment]);
    expect(target({route:'BANK_TRANSFER',code,creditorName:'Other authority'},[assessment])).toEqual([]);
    expect(target({route:'SARS_EFILING',uifViaSars:true},[assessment])).toEqual([]);
  });
});
