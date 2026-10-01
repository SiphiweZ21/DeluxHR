import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeeCommunicationsController, EmployeeCommunicationsAdminController } from './employee-communications.controller';
import { EmployeeCommunicationsService } from './employee-communications.service';
@Module({ imports: [AuditModule], controllers: [EmployeeCommunicationsController,EmployeeCommunicationsAdminController], providers: [EmployeeCommunicationsService], exports: [EmployeeCommunicationsService] })
export class EmployeeCommunicationsModule {}
