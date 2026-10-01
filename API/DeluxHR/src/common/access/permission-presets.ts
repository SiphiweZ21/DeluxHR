import { DataScope, Permission, UserRole } from '@prisma/client';

export type PermissionGrant = {
  permission: Permission;
  scope: DataScope;
};

const organization = (permission: Permission): PermissionGrant => ({
  permission,
  scope: DataScope.ORGANIZATION,
});

export const ROLE_PERMISSION_PRESETS: Partial<
  Record<UserRole, PermissionGrant[]>
> = {
  [UserRole.COMPANY_ADMIN]: [
    Permission.MANAGE_COMPANY,
    Permission.MANAGE_USERS,
    Permission.MANAGE_ACCESS,

    Permission.VIEW_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES,
    Permission.ADD_EMPLOYEES,
    Permission.APPROVE_EMPLOYEES,

    Permission.VIEW_EMPLOYEE_DOCUMENTS,
    Permission.MANAGE_EMPLOYEE_DOCUMENTS,
    Permission.VERIFY_EMPLOYEE_DOCUMENTS,

    Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS,
    Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS,
    Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

    Permission.MANAGE_LEAVE,
    Permission.VIEW_HR_REQUESTS,
    Permission.MANAGE_HR_REQUESTS,
    Permission.VIEW_COMMUNICATIONS,
    Permission.MANAGE_COMMUNICATIONS,

    Permission.VIEW_ATTENDANCE,
    Permission.MANAGE_ATTENDANCE,
    Permission.APPROVE_TIMESHEETS,

    Permission.VIEW_PAYROLL,
    Permission.MANAGE_PAYROLL,
    Permission.GENERATE_PAYROLL,
    Permission.REVIEW_PAYROLL,
    Permission.VIEW_ALL_PAYSLIPS,

    Permission.PREPARE_PAYROLL_PAYMENTS,
    Permission.APPROVE_PAYROLL_PAYMENTS,
    Permission.EXPORT_PAYROLL_PAYMENTS,

    Permission.VIEW_EXECUTIVE_DASHBOARD,
    Permission.VIEW_WORKFORCE_COST,
    Permission.VIEW_WORKFORCE_INSIGHTS,

    Permission.MANAGE_EARLY_PAY_POLICY,
    Permission.APPROVE_EARLY_PAY,

    Permission.VIEW_RISK_EVENTS,
    Permission.MANAGE_RISK_EVENTS,

    Permission.VIEW_AUDIT_LOGS,
  ].map(organization),

  [UserRole.EXECUTIVE]: [
    Permission.VIEW_EMPLOYEES,
    Permission.ADD_EMPLOYEES,

    Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS,
    Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS,

    Permission.VIEW_ATTENDANCE,

    Permission.VIEW_PAYROLL,
    Permission.REVIEW_PAYROLL,
    Permission.VIEW_ALL_PAYSLIPS,

    Permission.VIEW_EXECUTIVE_DASHBOARD,
    Permission.VIEW_WORKFORCE_COST,
    Permission.VIEW_WORKFORCE_INSIGHTS,

    Permission.VIEW_RISK_EVENTS,

    Permission.VIEW_AUDIT_LOGS,
  ].map(organization),

  [UserRole.HR_ADMIN]: [
    Permission.VIEW_WORKFORCE_INSIGHTS,
    Permission.VIEW_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES,
    Permission.ADD_EMPLOYEES,
    Permission.APPROVE_EMPLOYEES,

    Permission.VIEW_EMPLOYEE_DOCUMENTS,
    Permission.MANAGE_EMPLOYEE_DOCUMENTS,
    Permission.VERIFY_EMPLOYEE_DOCUMENTS,

    Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS,
    Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS,
    Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

    Permission.MANAGE_LEAVE,
    Permission.VIEW_HR_REQUESTS,
    Permission.MANAGE_HR_REQUESTS,
    Permission.VIEW_COMMUNICATIONS,
    Permission.MANAGE_COMMUNICATIONS,

    Permission.VIEW_ATTENDANCE,
    Permission.MANAGE_ATTENDANCE,
    Permission.APPROVE_TIMESHEETS,

    Permission.VIEW_RISK_EVENTS,
    Permission.MANAGE_RISK_EVENTS,

    Permission.VIEW_AUDIT_LOGS,
  ].map(organization),

  [UserRole.PAYROLL_ADMIN]: [
    Permission.VIEW_EMPLOYEES,
    Permission.ADD_EMPLOYEES,
    Permission.APPROVE_EMPLOYEES,

    Permission.VIEW_EMPLOYEE_DOCUMENTS,

    Permission.VIEW_EMPLOYEE_PAYMENT_DETAILS,
    Permission.MANAGE_EMPLOYEE_PAYMENT_DETAILS,
    Permission.APPROVE_EMPLOYEE_PAYMENT_DETAILS,

    Permission.VIEW_PAYROLL,
    Permission.MANAGE_PAYROLL,
    Permission.GENERATE_PAYROLL,
    Permission.REVIEW_PAYROLL,
    Permission.VIEW_ALL_PAYSLIPS,

    Permission.PREPARE_PAYROLL_PAYMENTS,
    Permission.APPROVE_PAYROLL_PAYMENTS,
    Permission.EXPORT_PAYROLL_PAYMENTS,

    Permission.MANAGE_EARLY_PAY_POLICY,
    Permission.APPROVE_EARLY_PAY,

    Permission.VIEW_RISK_EVENTS,
    Permission.MANAGE_RISK_EVENTS,

    Permission.VIEW_AUDIT_LOGS,
  ].map(organization),

  [UserRole.MANAGER]: [
    {
      permission: Permission.VIEW_TEAM,
      scope: DataScope.TEAM,
    },
    {
      permission: Permission.APPROVE_TEAM_LEAVE,
      scope: DataScope.TEAM,
    },
    {
      permission: Permission.VIEW_ATTENDANCE,
      scope: DataScope.TEAM,
    },
    {
      permission: Permission.APPROVE_TIMESHEETS,
      scope: DataScope.TEAM,
    },
  ],

  [UserRole.EMPLOYEE]: [
    {
      permission: Permission.VIEW_SELF,
      scope: DataScope.SELF,
    },
    {
      permission: Permission.VIEW_ATTENDANCE,
      scope: DataScope.SELF,
    },
    {
      permission: Permission.REQUEST_LEAVE,
      scope: DataScope.SELF,
    },
    {
      permission: Permission.VIEW_OWN_PAYSLIP,
      scope: DataScope.SELF,
    },
    {
      permission: Permission.REQUEST_EARLY_PAY,
      scope: DataScope.SELF,
    },
  ],

  // Platform roles do not inherit tenant permissions.
  [UserRole.SUPER_ADMIN]: [],
  [UserRole.PLATFORM_ADMIN]: [],
};
