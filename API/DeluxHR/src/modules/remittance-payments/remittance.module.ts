import { Module } from '@nestjs/common';
import { PayrollLiabilitiesModule } from '../payroll-liabilities/payroll-liabilities.module';
import {
  RemittanceBeneficiariesController,
  RemittancePaymentsController,
} from './remittance.controller';
import { RemittancePaymentsService } from './remittance.service';
@Module({
  imports: [PayrollLiabilitiesModule],
  controllers: [
    RemittanceBeneficiariesController,
    RemittancePaymentsController,
  ],
  providers: [RemittancePaymentsService],
})
export class RemittancePaymentsModule {}
