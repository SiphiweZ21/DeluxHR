export type PayrollPaymentExportAdapterId =
  | 'DELUXHR_GENERIC_CSV'
  | 'STANDARD_BANK_CSV'
  | 'FNB_OBE_BANKSERV'
  | 'FNB_CSV'
  | 'ABSA_CSV'
  | 'NEDBANK_CSV';

export type PayrollPaymentExportAdapterStatus =
  | 'IMPLEMENTED_FOR_TESTING'
  | 'AVAILABLE'
  | 'SPECIFICATION_REQUIRED';

export type PayrollPaymentInstruction = {
  paymentItemId: string;
  payrollRunId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  amount: number;
  currency: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchCode: string | null;
  accountType: string | null;
  paymentReference: string;
};

export type PayrollPaymentExportBatch = {
  paymentBatchId: string;
  payrollBatchId: string;
  currency: string;
  paymentDate: Date | null;
  employeeCount: number;
  totalAmount: number;
  instructions: PayrollPaymentInstruction[];
  funding?: {
    profileId: string;
    adapterId: string;
    adapterVersion: string;
    bank: string;
    name: string;
    accountNumber: string;
    branchCode: string;
    ownReference: string;
  } | null;
};

export type PayrollPaymentExportValidationIssue = {
  severity: 'BLOCKED' | 'WARNING';
  code: string;
  message: string;
  paymentItemId?: string;
  employeeId?: string;
};

export type PayrollPaymentExportValidationResult = {
  valid: boolean;
  issues: PayrollPaymentExportValidationIssue[];
};

export type PayrollPaymentExportAdapterDescriptor = {
  id: PayrollPaymentExportAdapterId;
  displayName: string;
  status: PayrollPaymentExportAdapterStatus;
  description: string;
  directlyBankImportable: boolean;
};

export type PayrollPaymentGeneratedFile = {
  fileName: string;
  contentType: string;
  content: Buffer;
};

export interface PayrollPaymentExportAdapter {
  readonly descriptor: PayrollPaymentExportAdapterDescriptor;

  validate(
    batch: PayrollPaymentExportBatch,
  ): PayrollPaymentExportValidationResult;

  generate?(batch: PayrollPaymentExportBatch): PayrollPaymentGeneratedFile;
}

// Shared bank layout input: neither payroll run nor payroll cycle identifiers are required.
export type BankPaymentDraftBatch = Omit<
  PayrollPaymentExportBatch,
  'payrollBatchId' | 'instructions'
> & {
  instructions: Omit<PayrollPaymentInstruction, 'payrollRunId'>[];
};
