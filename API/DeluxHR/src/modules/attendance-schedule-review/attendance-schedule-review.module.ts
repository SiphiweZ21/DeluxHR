import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecurringSchedulesModule } from '../recurring-schedules/recurring-schedules.module';
import { AttendanceScheduleReviewController } from './attendance-schedule-review.controller';
import { AttendanceScheduleReviewService } from './attendance-schedule-review.service';
@Module({ imports: [AuditModule, RecurringSchedulesModule], controllers: [AttendanceScheduleReviewController], providers: [AttendanceScheduleReviewService] })
export class AttendanceScheduleReviewModule {}
