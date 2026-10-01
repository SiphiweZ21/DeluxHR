import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExecutiveWorkforceController, WorkforceReportingController } from './workforce-reporting.controller';
import { WorkforceReportingService } from './workforce-reporting.service';
@Module({ imports:[AuditModule],controllers:[WorkforceReportingController,ExecutiveWorkforceController],providers:[WorkforceReportingService] })
export class WorkforceReportingModule {}
