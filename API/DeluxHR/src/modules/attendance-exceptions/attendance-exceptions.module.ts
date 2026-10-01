import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceExceptionsController } from './attendance-exceptions.controller';
import { AttendanceExceptionsService } from './attendance-exceptions.service';

@Module({
  imports: [AuditModule],
  controllers: [AttendanceExceptionsController],
  providers: [AttendanceExceptionsService],
  exports: [AttendanceExceptionsService],
})
export class AttendanceExceptionsModule {}
