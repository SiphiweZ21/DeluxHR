import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecurringSchedulesModule } from '../recurring-schedules/recurring-schedules.module';
import { AttendanceReviewController } from './attendance-review.controller';
import { AttendanceReviewService } from './attendance-review.service';
@Module({
  imports: [AuditModule, RecurringSchedulesModule, WhatsAppModule],
  controllers: [AttendanceReviewController],
  providers: [AttendanceReviewService],
  exports: [AttendanceReviewService],
})
export class AttendanceReviewModule {}
