import { EmployeeDocumentsModule } from '../employee-documents/employee-documents.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { DepartmentsModule } from '../departments/departments.module';
import { WorkLocationsModule } from '../work-locations/work-locations.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { LeaveTypesModule } from '../leave/leave-types/leave-types.module';
import { LeavePolicyModule } from '../leave/leave-policy/leave-policy.module';
import { PayrollConfigurationModule } from '../payroll-configuration/payroll-configuration.module';
import { EmployeesModule } from '../employees/employees.module';
import { CompanyUsersModule } from '../company-users/company-users.module';
import { EmployeePaymentDetailsModule } from '../employee-payment-details/employee-payment-details.module';
import { CustomerOnboardingController } from './customer-onboarding.controller';
import { CustomerOnboardingService } from './customer-onboarding.service';
@Module({
  imports: [
    EmployeeDocumentsModule,
    AuditModule,
    OrganizationsModule,
    DepartmentsModule,
    WorkLocationsModule,
    ShiftsModule,
    LeaveTypesModule,
    LeavePolicyModule,
    PayrollConfigurationModule,
    EmployeesModule,
    CompanyUsersModule,
    EmployeePaymentDetailsModule,
  ],
  controllers: [CustomerOnboardingController],
  providers: [CustomerOnboardingService],
  exports: [CustomerOnboardingService],
})
export class CustomerOnboardingModule {}
