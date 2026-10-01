import {
  RemittancePaymentsController,
  RemittanceBeneficiariesController,
} from '../remittance-payments/remittance.controller';
import {
  EarlyPayRepaymentsController,
  PlatformEarlyPayRepaymentsController,
} from '../early-pay-repayments/repayments.controller';
import { EarlyPayTreasuryController } from '../early-pay-treasury/treasury.controller';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollPaymentsController } from './payroll-payments.controller';
import { PayrollBatchesController } from '../payroll-batches/payroll-batches.controller';
import { CompanyBankingController } from '../company-banking/company-banking.controller';
describe('Payment modules startup registration', () => {
  it('resolves controllers and dependencies without connecting to a database', async () => {
    const before = process.env.JWT_SECRET;
    process.env.JWT_SECRET =
      'development-test-secret-with-at-least-32-characters';
    let module: any;
    try {
      module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
        .compile();
      expect(module.get(RemittancePaymentsController)).toBeDefined();
      expect(module.get(RemittanceBeneficiariesController)).toBeDefined();
      expect(module.get(PayrollPaymentsController)).toBeDefined();
      expect(module.get(PayrollBatchesController)).toBeDefined();
      expect(module.get(CompanyBankingController)).toBeDefined();
      expect(module.get(EarlyPayTreasuryController)).toBeDefined();
      expect(module.get(EarlyPayRepaymentsController)).toBeDefined();
      expect(module.get(PlatformEarlyPayRepaymentsController)).toBeDefined();
    } finally {
      if (module) await module.close();
      if (before === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = before;
    }
  });
});
