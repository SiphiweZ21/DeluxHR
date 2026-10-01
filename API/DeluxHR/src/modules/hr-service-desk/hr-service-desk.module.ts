import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HrServiceDeskController, HrServiceDeskAdminController } from './hr-service-desk.controller';
import { HrServiceDeskService } from './hr-service-desk.service';
@Module({ imports: [AuditModule], controllers: [HrServiceDeskController,HrServiceDeskAdminController], providers: [HrServiceDeskService], exports: [HrServiceDeskService] })
export class HrServiceDeskModule {}
