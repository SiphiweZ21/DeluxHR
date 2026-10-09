import { AccessControlModule } from '../../common/access/access-control.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecurringSchedulesModule } from '../recurring-schedules/recurring-schedules.module';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
@Module({ imports: [AccessControlModule,AuditModule, RecurringSchedulesModule], controllers: [TimesheetsController], providers: [TimesheetsService] })
export class TimesheetsModule {}
