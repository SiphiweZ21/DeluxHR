import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceIdentitiesController } from './attendance-identities.controller';
import { AttendanceIdentitiesService } from './attendance-identities.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceIdentitiesController],
  providers: [AttendanceIdentitiesService],
  exports: [AttendanceIdentitiesService],
})
export class AttendanceIdentitiesModule {}
