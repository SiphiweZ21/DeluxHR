import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PayrollLiabilitiesController } from './payroll-liabilities.controller';
import { PayrollLiabilitiesService } from './payroll-liabilities.service';
@Module({
  imports: [AuditModule],
  controllers: [PayrollLiabilitiesController],
  providers: [PayrollLiabilitiesService],
  exports: [PayrollLiabilitiesService],
})
export class PayrollLiabilitiesModule {}
