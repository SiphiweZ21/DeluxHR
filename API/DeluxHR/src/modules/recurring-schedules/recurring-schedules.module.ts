import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecurringSchedulesController } from './recurring-schedules.controller';
import { RecurringSchedulesService } from './recurring-schedules.service';
@Module({ imports: [AuditModule], controllers: [RecurringSchedulesController], providers: [RecurringSchedulesService], exports: [RecurringSchedulesService] })
export class RecurringSchedulesModule {}
