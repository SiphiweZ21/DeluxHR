import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PayslipsModule } from '../payslips/payslips.module';
import { LeaveRequestsModule } from '../leave/leave-requests/leave-requests.module';
import { LeavePolicyModule } from '../leave/leave-policy/leave-policy.module';
import { AttendanceEventsModule } from '../attendance-events/attendance-events.module';
import { EarlyPayModule } from '../early-pay/early-pay.module';
import { EmployeeCommunicationsModule } from '../employee-communications/employee-communications.module';
import { HrServiceDeskModule } from '../hr-service-desk/hr-service-desk.module';
import { AuditModule } from '../audit/audit.module';
import { WhatsAppEssController } from './whatsapp-ess.controller';
import { WhatsAppEssService } from './whatsapp-ess.service';
@Module({ imports: [WhatsAppModule,PayslipsModule,LeaveRequestsModule,LeavePolicyModule,AttendanceEventsModule,EarlyPayModule,AuditModule,HrServiceDeskModule,EmployeeCommunicationsModule], controllers: [WhatsAppEssController], providers: [WhatsAppEssService] })
export class WhatsAppEssModule {}
