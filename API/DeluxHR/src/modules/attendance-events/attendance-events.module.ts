import { AttendanceReviewModule } from '../attendance-review/attendance-review.module';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AttendanceEventsController } from './attendance-events.controller';
import { AttendanceEventsService } from './attendance-events.service';

@Module({
  imports: [AuditModule, AttendanceReviewModule],
  controllers: [AttendanceEventsController],
  providers: [AttendanceEventsService],
  exports: [AttendanceEventsService],
})
export class AttendanceEventsModule {}
