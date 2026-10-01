import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceSupervisorController } from './attendance-supervisor.controller';
import { AttendanceSupervisorService } from './attendance-supervisor.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceSupervisorController],
  providers: [AttendanceSupervisorService],
  exports: [AttendanceSupervisorService],
})
export class AttendanceSupervisorModule {}
