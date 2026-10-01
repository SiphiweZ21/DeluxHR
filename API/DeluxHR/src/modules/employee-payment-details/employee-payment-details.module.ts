import { Module } from '@nestjs/common';

import { PermissionsGuard } from '../../common/access/permissions.guard';
import { AuditModule } from '../audit/audit.module';

import { EmployeePaymentDetailsController } from './employee-payment-details.controller';
import { EmployeePaymentDetailsService } from './employee-payment-details.service';

@Module({
  imports: [AuditModule],
  controllers: [EmployeePaymentDetailsController],
  providers: [EmployeePaymentDetailsService, PermissionsGuard],
  exports: [EmployeePaymentDetailsService],
})
export class EmployeePaymentDetailsModule {}
