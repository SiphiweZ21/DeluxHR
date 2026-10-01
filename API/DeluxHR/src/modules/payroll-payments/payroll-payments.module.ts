import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PayrollPaymentsController } from './payroll-payments.controller';
import { PayrollPaymentsService } from './payroll-payments.service';

@Module({
  imports: [AuditModule],
  controllers: [PayrollPaymentsController],
  providers: [PayrollPaymentsService],
  exports: [PayrollPaymentsService],
})
export class PayrollPaymentsModule {}
