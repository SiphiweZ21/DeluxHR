import {
  PayrollPaymentExportAdapter,
  BankPaymentDraftBatch,
  PayrollPaymentExportValidationIssue,
} from './payment-export.types';
export class FnbBankservDraftAdapter implements PayrollPaymentExportAdapter {
  readonly descriptor = {
    id: 'FNB_OBE_BANKSERV' as const,
    displayName: 'FNB Enterprise Bankserv — draft',
    status: 'IMPLEMENTED_FOR_TESTING' as const,
    description:
      'February 2023 field layout. Record-length ambiguity and bank import validation remain unresolved. Draft only; not for bank upload.',
    directlyBankImportable: false,
  };
  validate(batch: BankPaymentDraftBatch) {
    const issues: PayrollPaymentExportValidationIssue[] = [];
    const block = (code: string, message: string) =>
      issues.push({ severity: 'BLOCKED', code, message });
    if (
      batch.funding?.adapterId !== 'FNB_OBE_BANKSERV' ||
      batch.funding.bank !== 'FNB' ||
      batch.funding.adapterVersion !== '2023-02'
    )
      block(
        'FUNDING_PROFILE_REQUIRED',
        'Requires a frozen approved FNB Enterprise Bankserv profile, version 2023-02.',
      );
    if (
      !batch.funding ||
      !/^\d{6,11}$/.test(batch.funding.accountNumber) ||
      !/^\d{6}$/.test(batch.funding.branchCode)
    )
      block(
        'INVALID_FUNDING_ACCOUNT',
        'Funding account must be 6–11 digits with a six-digit branch.',
      );
    if (
      !batch.paymentDate ||
      !Number.isFinite(batch.paymentDate.getTime()) ||
      batch.paymentDate.getUTCFullYear() < 2000 ||
      batch.paymentDate.getUTCFullYear() > 2099
    )
      block(
        'PAYMENT_DATE_REQUIRED',
        'A frozen valid payment date in 2000–2099 is required.',
      );
    if (batch.currency !== 'ZAR') block('UNSUPPORTED_CURRENCY', 'ZAR only.');
    if (
      !batch.instructions.length ||
      batch.instructions.length > 100000 ||
      batch.employeeCount !== batch.instructions.length
    )
      block(
        'INVALID_ITEM_COUNT',
        'Requires 1–100000 items matching employee count.',
      );
    const seen = new Set<string>();
    let cents = 0;
    for (const i of batch.instructions) {
      const validAmount =
        Number.isFinite(i.amount) &&
        i.amount > 0 &&
        Math.abs(i.amount * 100 - Math.round(i.amount * 100)) < 0.00001 &&
        Number.isSafeInteger(Math.round(i.amount * 100)) &&
        Math.round(i.amount * 100) <= 99999999999;
      if (!validAmount)
        block(
          'INVALID_AMOUNT',
          `Item ${i.paymentItemId}: positive amount with at most two decimals required.`,
        );
      else cents += Math.round(i.amount * 100);
      if (
        i.currency !== 'ZAR' ||
        !/^\d{6,20}$/.test(i.accountNumber) ||
        !/^\d{6}$/.test(i.branchCode ?? '')
      )
        block(
          'INVALID_RECIPIENT',
          `Item ${i.paymentItemId}: invalid currency/account/branch.`,
        );
      if (
        ![
          'CURRENT',
          'CHEQUE',
          'SAVINGS',
          'TRANSMISSION',
          '1',
          '2',
          '3',
        ].includes((i.accountType ?? '').toUpperCase())
      )
        block(
          'INVALID_ACCOUNT_TYPE',
          `Item ${i.paymentItemId}: unsupported account type.`,
        );
      if (!/^[A-Za-z0-9 /&().'-]{1,15}$/.test(i.accountHolderName))
        block(
          'INVALID_ACCOUNT_NAME',
          `Item ${i.paymentItemId}: account name must fit 15 ASCII characters without truncation.`,
        );
      if (
        !/^[A-Za-z0-9 /-]{1,20}$/.test(i.paymentReference) ||
        seen.has(i.paymentReference)
      )
        block(
          'INVALID_REFERENCE',
          `Item ${i.paymentItemId}: unique reference of 1–20 characters required.`,
        );
      seen.add(i.paymentReference);
    }
    if (
      !Number.isSafeInteger(cents) ||
      !Number.isFinite(batch.totalAmount) ||
      Math.round(batch.totalAmount * 100) !== cents
    )
      block('TOTAL_MISMATCH', 'Batch total does not equal item totals.');
    issues.push({
      severity: 'WARNING',
      code: 'BANK_VALIDATION_PENDING',
      message:
        'Draft uses 180 data columns plus CRLF. Bank document states an inconsistent total length. Do not upload to banking.',
    });
    return { valid: !issues.some((i) => i.severity === 'BLOCKED'), issues };
  }
  generate(batch: BankPaymentDraftBatch) {
    if (!this.validate(batch).valid)
      throw new Error('Draft validation failed.');
    const funding = batch.funding!;
    const record = (id: string) => id + '0'.repeat(178);
    const rows = [record('02'), record('04')];
    batch.instructions.forEach((i, index) => {
      const r = Array(180).fill('0');
      const put = (
        position: number,
        width: number,
        value: string,
        pad = '0',
      ) => {
        const s = value.padStart(width, pad);
        if (s.length !== width) throw new Error('Field overflow');
        for (let j = 0; j < width; j++) r[position - 1 + j] = s[j];
      };
      put(1, 2, '10');
      put(3, 6, funding.branchCode);
      put(9, 11, funding.accountNumber);
      put(24, 6, String(index + 1));
      put(30, 6, i.branchCode!);
      if (i.accountNumber.length <= 11) put(36, 11, i.accountNumber);
      else put(131, 20, i.accountNumber);
      const type =
        (
          {
            CURRENT: '1',
            CHEQUE: '1',
            SAVINGS: '2',
            TRANSMISSION: '3',
          } as Record<string, string>
        )[i.accountType!.toUpperCase()] ?? i.accountType!;
      put(47, 1, type);
      put(48, 11, String(Math.round(i.amount * 100)));
      put(71, 20, i.paymentReference.padEnd(20, ' '), ' ');
      put(101, 15, i.accountHolderName.padEnd(15, ' '), ' ');
      rows.push(r.join(''));
    });
    const contra = Array(180).fill('0');
    const put = (start: number, value: string) => {
      for (let j = 0; j < value.length; j++) contra[start - 1 + j] = value[j];
    };
    put(1, '12');
    put(3, funding.branchCode);
    put(9, funding.accountNumber.padStart(11, '0'));
    put(59, batch.paymentDate!.toISOString().slice(2, 10).replace(/-/g, ''));
    rows.push(contra.join(''));
    const trailer = Array(180).fill('0');
    trailer[0] = '9';
    trailer[1] = '2';
    for (let j = 72; j < 84; j++) trailer[j] = ' ';
    rows.push(trailer.join(''), record('94'));
    return {
      fileName: `DRAFT-NOT-FOR-BANK-UPLOAD-${batch.paymentBatchId.replace(/[^A-Za-z0-9-]/g, '')}.txt`,
      contentType: 'text/plain; charset=us-ascii',
      content: Buffer.from(rows.join('\r\n') + '\r\n', 'ascii'),
    };
  }
}
