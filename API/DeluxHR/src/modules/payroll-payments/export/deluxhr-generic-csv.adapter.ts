import {
  PayrollPaymentExportAdapter,
  PayrollPaymentExportAdapterDescriptor,
  PayrollPaymentExportBatch,
  PayrollPaymentExportValidationIssue,
  PayrollPaymentExportValidationResult,
  PayrollPaymentGeneratedFile,
} from './payment-export.types';

export class DeluxhrGenericCsvAdapter implements PayrollPaymentExportAdapter {
  readonly descriptor: PayrollPaymentExportAdapterDescriptor = {
    id: 'DELUXHR_GENERIC_CSV',
    displayName: 'DeluxHR Generic CSV',
    status: 'AVAILABLE',
    description:
      'DeluxHR-defined payroll payment interchange format. It is not represented as a bank-certified or universally bank-importable file.',
    directlyBankImportable: false,
  };

  validate(
    batch: PayrollPaymentExportBatch,
  ): PayrollPaymentExportValidationResult {
    const issues: PayrollPaymentExportValidationIssue[] = [];

    if (batch.instructions.length === 0) {
      issues.push({
        severity: 'BLOCKED',
        code: 'NO_PAYMENT_INSTRUCTIONS',
        message: 'Payment batch contains no employee payment instructions.',
      });
    }

    if (batch.currency !== 'ZAR') {
      issues.push({
        severity: 'BLOCKED',
        code: 'UNSUPPORTED_CURRENCY',
        message:
          'The initial DeluxHR Generic CSV export supports ZAR payroll payment batches only.',
      });
    }

    for (const instruction of batch.instructions) {
      if (!Number.isFinite(instruction.amount) || instruction.amount < 0) {
        issues.push({
          severity: 'BLOCKED',
          code: 'INVALID_AMOUNT',
          message: 'Payment instruction contains an invalid amount.',
          paymentItemId: instruction.paymentItemId,
          employeeId: instruction.employeeId,
        });
      }

      if (!instruction.accountNumber.trim()) {
        issues.push({
          severity: 'BLOCKED',
          code: 'ACCOUNT_NUMBER_REQUIRED',
          message: 'Payment instruction is missing an account number.',
          paymentItemId: instruction.paymentItemId,
          employeeId: instruction.employeeId,
        });
      }

      if (!instruction.accountHolderName.trim()) {
        issues.push({
          severity: 'BLOCKED',
          code: 'ACCOUNT_HOLDER_REQUIRED',
          message: 'Payment instruction is missing an account holder name.',
          paymentItemId: instruction.paymentItemId,
          employeeId: instruction.employeeId,
        });
      }

      if (!instruction.bankName.trim()) {
        issues.push({
          severity: 'BLOCKED',
          code: 'BANK_NAME_REQUIRED',
          message: 'Payment instruction is missing a bank name.',
          paymentItemId: instruction.paymentItemId,
          employeeId: instruction.employeeId,
        });
      }

      if (!instruction.branchCode?.trim()) {
        issues.push({
          severity: 'WARNING',
          code: 'BRANCH_CODE_MISSING',
          message:
            'Branch code is missing. A future bank-specific adapter may require it.',
          paymentItemId: instruction.paymentItemId,
          employeeId: instruction.employeeId,
        });
      }

      if (!instruction.accountType?.trim()) {
        issues.push({
          severity: 'WARNING',
          code: 'ACCOUNT_TYPE_MISSING',
          message:
            'Account type is missing. A future bank-specific adapter may require it.',
          paymentItemId: instruction.paymentItemId,
          employeeId: instruction.employeeId,
        });
      }
    }

    return {
      valid: !issues.some((issue) => issue.severity === 'BLOCKED'),
      issues,
    };
  }

  generate(batch: PayrollPaymentExportBatch): PayrollPaymentGeneratedFile {
    const validation = this.validate(batch);

    if (!validation.valid) {
      throw new Error(
        'DeluxHR Generic CSV cannot be generated because export validation failed.',
      );
    }

    const header = [
      'Employee Number',
      'Employee Name',
      'Bank Name',
      'Account Holder',
      'Account Number',
      'Branch Code',
      'Account Type',
      'Amount',
      'Currency',
      'Payment Reference',
    ];

    const rows = batch.instructions.map((instruction) => [
      instruction.employeeNumber,
      instruction.employeeName,
      instruction.bankName,
      instruction.accountHolderName,
      instruction.accountNumber,
      instruction.branchCode ?? '',
      instruction.accountType ?? '',
      instruction.amount.toFixed(2),
      instruction.currency,
      instruction.paymentReference,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => this.escapeCsv(value)).join(','))
      .join('\r\n')
      .concat('\r\n');

    const safeBatchId = batch.paymentBatchId.replace(/[^A-Za-z0-9-]/g, '');
    const fileName = `deluxhr-payroll-payments-${safeBatchId}.csv`;

    return {
      fileName,
      contentType: 'text/csv; charset=utf-8',
      content: Buffer.from(csv, 'utf8'),
    };
  }

  private escapeCsv(value: string) {
    const safe = this.neutralizeSpreadsheetFormula(value);
    const escaped = safe.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private neutralizeSpreadsheetFormula(value: string) {
    if (/^[=+\-@]/.test(value)) {
      return `'${value}`;
    }

    return value;
  }
}
