import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PayslipsModule } from '../payslips/payslips.module';
import { PayrollBatchesController } from './payroll-batches.controller';
import { PayrollBatchesService } from './payroll-batches.service';

@Module({
  imports: [AuditModule, PayrollModule, PayslipsModule],
  controllers: [PayrollBatchesController],
  providers: [PayrollBatchesService],
  exports: [PayrollBatchesService],
})
export class PayrollBatchesModule {}
