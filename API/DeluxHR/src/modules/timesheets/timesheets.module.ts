import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecurringSchedulesModule } from '../recurring-schedules/recurring-schedules.module';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
@Module({ imports: [AuditModule, RecurringSchedulesModule], controllers: [TimesheetsController], providers: [TimesheetsService] })
export class TimesheetsModule {}
