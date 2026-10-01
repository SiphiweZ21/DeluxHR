import {
  PayrollPaymentExportAdapter,
  PayrollPaymentExportAdapterDescriptor,
  PayrollPaymentExportBatch,
  PayrollPaymentExportValidationResult,
} from './payment-export.types';

export class SpecificationRequiredAdapter implements PayrollPaymentExportAdapter {
  constructor(readonly descriptor: PayrollPaymentExportAdapterDescriptor) {}

  validate(
    _batch: PayrollPaymentExportBatch,
  ): PayrollPaymentExportValidationResult {
    return {
      valid: false,
      issues: [
        {
          severity: 'BLOCKED',
          code: 'BANK_SPECIFICATION_REQUIRED',
          message: `${this.descriptor.displayName} cannot be generated until its current payroll/bulk-payment import specification has been verified and implemented.`,
        },
      ],
    };
  }
}
