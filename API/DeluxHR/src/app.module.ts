import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AuditModule } from './modules/audit/audit.module';
import { LeaveTypesModule } from './modules/leave/leave-types/leave-types.module';
import { LeaveRequestsModule } from './modules/leave/leave-requests/leave-requests.module';
//import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { EarningsModule } from './modules/earnings/earnings.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { PayslipsModule } from './modules/payslips/payslips.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EarlyPayModule } from './modules/early-pay/early-pay.module';
import { PayrollConfigurationModule } from './modules/payroll-configuration/payroll-configuration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    OrganizationsModule,
    DepartmentsModule,
    EmployeesModule,
    LeaveTypesModule,
    AuditModule,
    LeaveRequestsModule,
    AuthModule,
    EarningsModule,
    PayrollModule,
    TimesheetsModule,
    PayslipsModule,
    WhatsAppModule,
    AttendanceModule,
    EarlyPayModule,
    PayrollConfigurationModule,
  ],
  providers: [],
})
export class AppModule {}
