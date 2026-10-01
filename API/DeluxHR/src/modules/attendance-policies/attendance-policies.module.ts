import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendancePoliciesController } from './attendance-policies.controller';
import { AttendancePoliciesService } from './attendance-policies.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendancePoliciesController],
  providers: [AttendancePoliciesService],
  exports: [AttendancePoliciesService],
})
export class AttendancePoliciesModule {}
