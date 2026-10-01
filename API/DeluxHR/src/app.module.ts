import { RemittancePaymentsModule } from './modules/remittance-payments/remittance.module';
import { EarlyPayRepaymentsModule } from './modules/early-pay-repayments/repayments.module';
import { EarlyPayTreasuryModule } from './modules/early-pay-treasury/treasury.module';
import { PayrollBatchesModule } from './modules/payroll-batches/payroll-batches.module';
import { PayrollPaymentsModule } from './modules/payroll-payments/payroll-payments.module';
import { CompanyBankingModule } from './modules/company-banking/company-banking.module';
import { WorkspaceAccessModule } from './modules/workspace-access/workspace-access.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';

import { AccessControlModule } from './common/access/access-control.module';
import { EntitlementsModule } from './common/entitlements/entitlements.module';

import { OrganizationsModule } from './modules/organizations/organizations.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { EmployeeDocumentsModule } from './modules/employee-documents/employee-documents.module';
import { AuditModule } from './modules/audit/audit.module';
import { LeaveTypesModule } from './modules/leave/leave-types/leave-types.module';
import { LeaveWorkflowsModule } from './modules/leave/leave-workflows/leave-workflows.module';
import { LeavePolicyModule } from './modules/leave/leave-policy/leave-policy.module';
import { LeaveRequestsModule } from './modules/leave/leave-requests/leave-requests.module';
import { AuthModule } from './modules/auth/auth.module';
import { EarningsModule } from './modules/earnings/earnings.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { PayslipsModule } from './modules/payslips/payslips.module';
import { WorkforceReportingModule } from './modules/workforce-reporting/workforce-reporting.module';
import { CustomerOnboardingModule } from './modules/customer-onboarding/customer-onboarding.module';
import { PayrollLiabilitiesModule } from './modules/payroll-liabilities/payroll-liabilities.module';
import { EmployeeCommunicationsModule } from './modules/employee-communications/employee-communications.module';
import { HrServiceDeskModule } from './modules/hr-service-desk/hr-service-desk.module';
import { WhatsAppEssModule } from './modules/whatsapp-ess/whatsapp-ess.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EarlyPayModule } from './modules/early-pay/early-pay.module';
import { PayrollConfigurationModule } from './modules/payroll-configuration/payroll-configuration.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { CompanyUsersModule } from './modules/company-users/company-users.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { WorkLocationsModule } from './modules/work-locations/work-locations.module';
import { EmployeeWorkLocationsModule } from './modules/employee-work-locations/employee-work-locations.module';
import { AttendancePoliciesModule } from './modules/attendance-policies/attendance-policies.module';
import { AttendanceEventsModule } from './modules/attendance-events/attendance-events.module';
import { AttendanceWebModule } from './modules/attendance-web/attendance-web.module';
import { AttendanceIdentitiesModule } from './modules/attendance-identities/attendance-identities.module';
import { AttendanceKiosksModule } from './modules/attendance-kiosks/attendance-kiosks.module';
import { AttendanceSiteQrModule } from './modules/attendance-site-qr/attendance-site-qr.module';
import { AttendanceOfflineSyncModule } from './modules/attendance-offline-sync/attendance-offline-sync.module';
import { AttendanceFieldModule } from './modules/attendance-field/attendance-field.module';
import { AttendanceHistoryModule } from './modules/attendance-history/attendance-history.module';
import { AttendanceExceptionsModule } from './modules/attendance-exceptions/attendance-exceptions.module';
import { AttendanceSupervisorModule } from './modules/attendance-supervisor/attendance-supervisor.module';
import { AttendanceScheduleReviewModule } from './modules/attendance-schedule-review/attendance-schedule-review.module';
import { RecurringSchedulesModule } from './modules/recurring-schedules/recurring-schedules.module';
import { ShiftAssignmentsModule } from './modules/shift-assignments/shift-assignments.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AttendanceCorrectionsModule } from './modules/attendance-corrections/attendance-corrections.module';

@Module({
  imports: [
    PayrollBatchesModule,
    PayrollPaymentsModule,
    EarlyPayTreasuryModule,
    EarlyPayRepaymentsModule,
    RemittancePaymentsModule,
    CompanyBankingModule,
    WorkspaceAccessModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,

    AccessControlModule,
    EntitlementsModule,

    OrganizationsModule,
    DepartmentsModule,
    EmployeesModule,
    EmployeeDocumentsModule,
    AuditModule,
    LeaveTypesModule,
    LeaveRequestsModule,
    LeavePolicyModule,
    LeaveWorkflowsModule,
    AuthModule,
    EarningsModule,
    PayrollModule,
    TimesheetsModule,
    PayslipsModule,
    WhatsAppModule,
    HrServiceDeskModule,
    EmployeeCommunicationsModule,
    PayrollLiabilitiesModule,
    CustomerOnboardingModule,
    WorkforceReportingModule,
    WhatsAppEssModule,
    AttendanceModule,
    EarlyPayModule,
    PayrollConfigurationModule,
    PlatformAdminModule,
    CompanyUsersModule,
    OnboardingModule,
    WorkLocationsModule,
    EmployeeWorkLocationsModule,
    AttendancePoliciesModule,
    AttendanceEventsModule,
    AttendanceWebModule,
    AttendanceIdentitiesModule,
    AttendanceKiosksModule,
    AttendanceSiteQrModule,
    AttendanceOfflineSyncModule,
    AttendanceFieldModule,
    AttendanceHistoryModule,
    AttendanceExceptionsModule,
    AttendanceSupervisorModule,
    AttendanceCorrectionsModule,
    ShiftsModule,
    ShiftAssignmentsModule,
    RecurringSchedulesModule,
    AttendanceScheduleReviewModule,
  ],
  providers: [],
})
export class AppModule {}
