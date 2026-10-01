import { FnbBankservDraftAdapter } from './fnb-bankserv-draft.adapter';
import type { PayrollPaymentExportBatch } from './payment-export.types';
const input = (): PayrollPaymentExportBatch => ({
  paymentBatchId: 'batch-1',
  payrollBatchId: 'cycle',
  currency: 'ZAR',
  paymentDate: new Date('2026-10-01T00:00:00Z'),
  employeeCount: 1,
  totalAmount: 3728.68,
  funding: {
    profileId: 'funding',
    adapterId: 'FNB_OBE_BANKSERV',
    adapterVersion: '2023-02',
    bank: 'FNB',
    name: 'Payroll',
    accountNumber: '00123456789',
    branchCode: '250655',
    ownReference: 'PAYROLL',
  },
  instructions: [
    {
      paymentItemId: 'item',
      payrollRunId: 'run',
      employeeId: 'employee',
      employeeNumber: 'E1',
      employeeName: 'Demo Employee',
      amount: 3728.68,
      currency: 'ZAR',
      bankName: 'Other Bank',
      accountHolderName: 'DEMO EMPLOYEE',
      accountNumber: '00012345678',
      branchCode: '632005',
      accountType: 'CURRENT',
      paymentReference: 'SAL1234567890',
    },
  ],
});
describe('FNB Bankserv draft', () => {
  const adapter = new FnbBankservDraftAdapter();
  it('is never a production bank adapter', () => {
    expect(adapter.descriptor.status).toBe('IMPLEMENTED_FOR_TESTING');
    expect(adapter.descriptor.directlyBankImportable).toBe(false);
    expect(adapter.validate(input()).issues).toContainEqual(
      expect.objectContaining({
        code: 'BANK_VALIDATION_PENDING',
        severity: 'WARNING',
      }),
    );
  });
  it('matches fixed columns, cents, records and frozen action date', () => {
    const rows = adapter
      .generate(input())
      .content.toString('ascii')
      .split('\r\n');
    expect(rows.pop()).toBe('');
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.length === 180)).toBe(true);
    expect(rows.map((r) => r.slice(0, 2))).toEqual([
      '02',
      '04',
      '10',
      '12',
      '92',
      '94',
    ]);
    expect(rows[2].slice(8, 19)).toBe('00123456789');
    expect(rows[2].slice(35, 46)).toBe('00012345678');
    expect(rows[2].slice(47, 58)).toBe('00000372868');
    expect(rows[2].slice(70, 90)).toBe('SAL1234567890       ');
    expect(rows[3].slice(58, 64)).toBe('261001');
    expect(rows[4].slice(72, 84)).toBe(' '.repeat(12));
  });
  it('uses extended account slot without dropping digits', () => {
    const b = input();
    b.instructions[0].accountNumber = '00123456789012345678';
    const r = adapter.generate(b).content.toString('ascii').split('\r\n')[2];
    expect(r.slice(35, 46)).toBe('0'.repeat(11));
    expect(r.slice(130, 150)).toBe('00123456789012345678');
  });
  it.each([
    ['amount', 0],
    ['amount', 1.001],
    ['accountNumber', '1e10'],
    ['accountType', 'EWALLET'],
    ['branchCode', '123'],
    ['accountHolderName', 'LONG NAME THAT MUST NOT BE TRUNCATED'],
    ['paymentReference', 'REF-WITH-MORE-THAN-TWENTY-CHARACTERS'],
  ])('blocks invalid %s=%s', (key, value) => {
    const b = input();
    (b.instructions[0] as any)[key] = value;
    expect(adapter.validate(b).valid).toBe(false);
    expect(() => adapter.generate(b)).toThrow();
  });
  it('blocks absent/mismatched funding, dates, totals, currencies and counts', () => {
    for (const patch of [
      { funding: null },
      { paymentDate: null },
      { totalAmount: 1 },
      { currency: 'USD' },
      { employeeCount: 2 },
    ])
      expect(adapter.validate({ ...input(), ...patch }).valid).toBe(false);
  });
  it('rejects duplicate recipient references', () => {
    const b = input();
    b.instructions.push({ ...b.instructions[0], paymentItemId: 'item2' });
    b.employeeCount = 2;
    b.totalAmount *= 2;
    expect(adapter.validate(b).issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_REFERENCE' }),
    );
  });
  it('generates deterministic draft bytes and a conspicuous filename', () => {
    expect(
      adapter
        .generate(input())
        .content.equals(adapter.generate(input()).content),
    ).toBe(true);
    expect(adapter.generate(input()).fileName).toMatch(
      /^DRAFT-NOT-FOR-BANK-UPLOAD-/,
    );
  });
});
