import { createHash } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PayrollPaymentsService } from './payroll-payments.service';
const actor = {
  sub: 'maker',
  organizationId: 'org',
  email: 'maker@example.test',
  role: 'COMPANY_ADMIN',
} as const;
const funding = {
  id: 'funding',
  organizationId: 'org',
  name: 'Original Payroll',
  bank: 'FNB',
  channel: 'Online Banking Enterprise',
  adapterId: 'FNB_OBE_BANKSERV',
  adapterVersion: '2023-02',
  accountNumber: '00123456789',
  branchCode: '250655',
  ownReference: 'PAYROLL',
  currency: 'ZAR',
  status: 'APPROVED',
};
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    companyBankingDefault: {
      findUnique: jest.fn().mockResolvedValue({ profileId: 'funding' }),
    },
    companyBankingProfile: { findFirst: jest.fn().mockResolvedValue(funding) },
    payrollPaymentBatch: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        ...data,
        id: 'payment',
        items: [],
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payrollPaymentItem: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    ...tx,
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new PayrollPaymentsService(db as any, audit as any);
  const payroll = {
    id: 'cycle',
    currency: 'ZAR',
    paymentDate: new Date('2026-10-01'),
    payrollRuns: [
      {
        id: '12345678-1234-1234-1234-123456789012',
        netPay: 100.01,
        currency: 'ZAR',
        employeeId: 'employee',
        employee: {
          employeeNumber: 'E1',
          firstName: 'Original',
          lastName: 'Name',
          paymentDetails: [
            {
              id: 'bank',
              version: 1,
              bankName: 'FNB',
              accountHolderName: 'DEMO EMPLOYEE',
              accountNumber: '00012345678',
              branchCode: '250655',
              accountType: 'CURRENT',
              approvedAt: new Date('2026-09-01'),
            },
          ],
        },
      },
    ],
  };
  jest
    .spyOn(service as any, 'loadPayrollForPaymentReadiness')
    .mockResolvedValue(payroll);
  jest
    .spyOn(service as any, 'evaluatePaymentReadiness')
    .mockReturnValue({ canPrepare: true });
  return { tx, db, audit, service, payroll };
}
describe('Payroll funding and file freeze', () => {
  it('locks tenant and freezes approved salary default, payment date and employee identity', async () => {
    const { service, tx, payroll } = setup();
    await service.prepareFromLockedPayroll('org', 'cycle', actor);
    const data = tx.payrollPaymentBatch.create.mock.calls[0][0].data;
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.companyBankingProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'funding', organizationId: 'org', status: 'APPROVED' },
    });
    expect(data.fundingSnapshot.accountNumber).toBe('00123456789');
    expect(data.paymentDateSnapshot).toEqual(payroll.paymentDate);
    expect(data.items.create[0].paymentDestinationSnapshot).toMatchObject({
      snapshotVersion: 2,
      employeeName: 'Original Name',
      employeeNumber: 'E1',
      paymentReference: 'SAL1234567812341234',
    });
  });
  it('uses explicit approved profile override and refuses foreign/unapproved profile', async () => {
    const { service, tx } = setup();
    await service.prepareFromLockedPayroll('org', 'cycle', actor, 'override');
    expect(tx.companyBankingProfile.findFirst.mock.calls[0][0].where.id).toBe(
      'override',
    );
    tx.companyBankingProfile.findFirst.mockResolvedValue(null as any);
    await expect(
      service.prepareFromLockedPayroll('org', 'cycle', actor, 'foreign'),
    ).rejects.toThrow(BadRequestException);
  });
  it('allows no-profile legacy report preparation but rejects mismatched currencies', async () => {
    const { service, tx } = setup();
    tx.companyBankingDefault.findUnique.mockResolvedValue(null as any);
    await service.prepareFromLockedPayroll('org', 'cycle', actor);
    expect(
      tx.payrollPaymentBatch.create.mock.calls[0][0].data.fundingSnapshot,
    ).toBeUndefined();
    tx.companyBankingDefault.findUnique.mockResolvedValue({
      profileId: 'funding',
    });
    tx.companyBankingProfile.findFirst.mockResolvedValue({
      ...funding,
      currency: 'USD',
    });
    await expect(
      service.prepareFromLockedPayroll('org', 'cycle', actor),
    ).rejects.toThrow(BadRequestException);
  });
  it('returns original saved bytes and never reruns a generator', async () => {
    const { service, db } = setup();
    const content = Buffer.from('original\r\n');
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'EXPORTED',
      exportAdapterId: 'TEST_VERIFIED',
      exportFileBytes: content,
      exportContentType: 'text/plain',
      exportFileName: 'original.txt',
      exportReference: 'EXP-1',
      exportSha256: createHash('sha256').update(content).digest('hex'),
    } as any);
    const result = await service.generateExportFile(
      'org',
      'payment',
      'TEST_VERIFIED' as any,
      actor,
    );
    expect(result.content.equals(content)).toBe(true);
    expect(result.exportReference).toBe('EXP-1');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects changed adapters, corrupted stored bytes and legacy export regeneration', async () => {
    const { service, db } = setup();
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'EXPORTED',
      exportAdapterId: 'FNB_CSV',
      exportFileBytes: Buffer.from('old'),
      exportSha256: 'wrong',
    } as any);
    await expect(
      service.generateExportFile('org', 'payment', 'ABSA_CSV', actor),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.generateExportFile('org', 'payment', 'FNB_CSV', actor),
    ).rejects.toThrow(ConflictException);
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'EXPORTED',
      exportFileBytes: null,
    } as any);
    await expect(
      service.generateExportFile('org', 'payment', 'FNB_CSV', actor),
    ).rejects.toThrow(ConflictException);
  });
  it('cannot promote a draft or generic report to production export', async () => {
    const { service, db, tx } = setup();
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'APPROVED_FOR_EXPORT',
      exportFileBytes: null,
    } as any);
    for (const adapter of ['FNB_OBE_BANKSERV', 'DELUXHR_GENERIC_CSV'])
      await expect(
        service.generateExportFile('org', 'payment', adapter as any, actor),
      ).rejects.toThrow(BadRequestException);
    expect(tx.payrollPaymentBatch.updateMany).not.toHaveBeenCalled();
  });
  it('freezes exact output, hash and selected adapter when a verified generator succeeds', async () => {
    const { service, db, tx } = setup();
    const content = Buffer.from('bank file\r\n');
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'APPROVED_FOR_EXPORT',
      exportFileBytes: null,
    } as any);
    (service as any).exportRegistry = {
      get: () => ({
        descriptor: {
          id: 'TEST_VERIFIED',
          status: 'AVAILABLE',
          directlyBankImportable: true,
        },
        validate: () => ({ valid: true, issues: [] }),
        generate: () => ({
          content,
          fileName: 'bank.txt',
          contentType: 'text/plain',
        }),
      }),
    };
    jest
      .spyOn(service as any, 'loadApprovedPaymentBatchForExport')
      .mockResolvedValue({
        employeeCount: 1,
        totalAmount: 100,
        funding: { adapterId: 'TEST_VERIFIED' },
        currency: 'ZAR',
      });
    await service.generateExportFile(
      'org',
      'payment',
      'TEST_VERIFIED' as any,
      actor,
    );
    const data = tx.payrollPaymentBatch.updateMany.mock.calls[0][0].data;
    expect(Buffer.from(data.exportFileBytes).equals(content)).toBe(true);
    expect(data.exportAdapterId).toBe('TEST_VERIFIED');
    expect(data.exportSha256).toBe(
      createHash('sha256').update(content).digest('hex'),
    );
  });
  it('report downloads and draft downloads do not advance status', async () => {
    const { service, tx } = setup();
    const batch = {
      paymentBatchId: 'payment',
      payrollBatchId: 'cycle',
      paymentDate: new Date('2026-10-01'),
      employeeCount: 1,
      totalAmount: 100.01,
      currency: 'ZAR',
      funding: { ...funding, profileId: funding.id },
      instructions: [
        {
          paymentItemId: 'item',
          payrollRunId: 'run',
          employeeId: 'employee',
          employeeNumber: 'E1',
          employeeName: 'Original Name',
          amount: 100.01,
          currency: 'ZAR',
          bankName: 'FNB',
          accountHolderName: 'DEMO EMPLOYEE',
          accountNumber: '00012345678',
          branchCode: '250655',
          accountType: 'CURRENT',
          paymentReference: 'SAL1234567890',
        },
      ],
    };
    jest
      .spyOn(service as any, 'loadApprovedPaymentBatchForExport')
      .mockResolvedValue(batch);
    await service.generateReport('org', 'payment', actor);
    const draft = await service.generateDraft(
      'org',
      'payment',
      'FNB_OBE_BANKSERV',
      actor,
    );
    expect(draft.fileName).toMatch(/^DRAFT-NOT-FOR-BANK-UPLOAD/);
    expect(tx.payrollPaymentBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.payrollPaymentItem.updateMany).not.toHaveBeenCalled();
  });
  it('export loader uses frozen identity/date instead of current employee and cycle', async () => {
    const { service, db } = setup();
    const date = new Date('2026-10-01');
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      id: 'payment',
      payrollBatchId: 'cycle',
      status: 'APPROVED_FOR_EXPORT',
      currency: 'ZAR',
      employeeCount: 1,
      totalAmount: 100.01,
      paymentDateSnapshot: date,
      payrollBatch: { paymentDate: new Date('2027-01-01') },
      fundingSnapshot: { ...funding, profileId: funding.id },
      items: [
        {
          id: 'item',
          employeeId: 'employee',
          payrollRunId: 'run',
          amount: 100.01,
          currency: 'ZAR',
          employee: {
            employeeNumber: 'CHANGED',
            firstName: 'Changed',
            lastName: 'User',
          },
          paymentDestinationSnapshot: {
            bankName: 'FNB',
            accountHolderName: 'DEMO EMPLOYEE',
            accountNumber: '00012345678',
            employeeName: 'Original Name',
            employeeNumber: 'E1',
            paymentReference: 'SALORIGINAL',
          },
        },
      ],
    } as any);
    const batch = await (service as any).loadApprovedPaymentBatchForExport(
      'org',
      'payment',
    );
    expect(batch.paymentDate).toEqual(date);
    expect(batch.instructions[0]).toMatchObject({
      employeeName: 'Original Name',
      employeeNumber: 'E1',
      paymentReference: 'SALORIGINAL',
    });
  });
  it('detail responses mask frozen funding and beneficiary accounts', async () => {
    const { service, db } = setup();
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      id: 'payment',
      fundingSnapshot: { ...funding, profileId: 'funding' },
      items: [
        {
          id: 'item',
          paymentDestinationSnapshot: {
            accountNumber: '00012345678',
            accountHolderName: 'Demo Employee',
            employeeName: 'Original Name',
          },
        },
      ],
    } as any);
    const result = await service.findOne('org', 'payment');
    expect(result.funding?.accountNumberMasked).toBe('••••6789');
    expect(result.items[0].beneficiary.accountNumberMasked).toBe('••••5678');
    expect(JSON.stringify(result)).not.toContain('00123456789');
    expect(JSON.stringify(result)).not.toContain('00012345678');
  });
  it('refuses concurrent export regeneration and mismatched frozen funding adapters', async () => {
    const { service, db } = setup();
    const adapter = {
      descriptor: {
        id: 'TEST_VERIFIED',
        status: 'AVAILABLE',
        directlyBankImportable: true,
      },
      validate: () => ({ valid: true, issues: [] }),
      generate: () => ({
        content: Buffer.from('new content'),
        fileName: 'bank.txt',
        contentType: 'text/plain',
      }),
    };
    (service as any).exportRegistry = { get: () => adapter };
    const load = jest
      .spyOn(service as any, 'loadApprovedPaymentBatchForExport')
      .mockResolvedValue({ funding: { adapterId: 'OTHER' } });
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'APPROVED_FOR_EXPORT',
    } as any);
    await expect(
      service.generateExportFile(
        'org',
        'payment',
        'TEST_VERIFIED' as any,
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
    load.mockResolvedValue({ funding: { adapterId: 'TEST_VERIFIED' } });
    db.payrollPaymentBatch.findFirst
      .mockResolvedValueOnce({ status: 'APPROVED_FOR_EXPORT' } as any)
      .mockResolvedValueOnce({
        status: 'EXPORTED',
        exportReference: 'EXP-EXISTING',
      } as any);
    await expect(
      service.generateExportFile(
        'org',
        'payment',
        'TEST_VERIFIED' as any,
        actor,
      ),
    ).rejects.toThrow(ConflictException);
  });
  it('rejects cancelled frozen-file downloads', async () => {
    const { service, db } = setup();
    db.payrollPaymentBatch.findFirst.mockResolvedValue({
      status: 'CANCELLED',
      exportFileBytes: Buffer.from('old'),
    } as any);
    await expect(
      service.generateExportFile('org', 'payment', 'FNB_CSV', actor),
    ).rejects.toThrow(ConflictException);
  });
});
