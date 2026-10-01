import { FnbBankservDraftAdapter } from './fnb-bankserv-draft.adapter';
import { DeluxhrGenericCsvAdapter } from './deluxhr-generic-csv.adapter';
import { PayrollPaymentExportAdapter } from './payment-export.types';
import { SpecificationRequiredAdapter } from './specification-required.adapter';

export class PayrollPaymentExportRegistry {
  private readonly adapters: PayrollPaymentExportAdapter[];

  constructor() {
    this.adapters = [
      new DeluxhrGenericCsvAdapter(),
      new FnbBankservDraftAdapter(),
      new SpecificationRequiredAdapter({
        id: 'STANDARD_BANK_CSV',
        displayName: 'Standard Bank CSV',
        status: 'SPECIFICATION_REQUIRED',
        description:
          'Reserved for a verified Standard Bank salary/bulk-payment import specification.',
        directlyBankImportable: false,
      }),
      new SpecificationRequiredAdapter({
        id: 'FNB_CSV',
        displayName: 'FNB CSV',
        status: 'SPECIFICATION_REQUIRED',
        description:
          'Reserved for a verified FNB salary/bulk-payment import specification.',
        directlyBankImportable: false,
      }),
      new SpecificationRequiredAdapter({
        id: 'ABSA_CSV',
        displayName: 'Absa CSV',
        status: 'SPECIFICATION_REQUIRED',
        description:
          'Reserved for a verified Absa salary/bulk-payment import specification.',
        directlyBankImportable: false,
      }),
      new SpecificationRequiredAdapter({
        id: 'NEDBANK_CSV',
        displayName: 'Nedbank CSV',
        status: 'SPECIFICATION_REQUIRED',
        description:
          'Reserved for a verified Nedbank salary/bulk-payment import specification.',
        directlyBankImportable: false,
      }),
    ];
  }

  list() {
    return this.adapters.map((adapter) => adapter.descriptor);
  }

  get(id: string) {
    return this.adapters.find((adapter) => adapter.descriptor.id === id);
  }
}
