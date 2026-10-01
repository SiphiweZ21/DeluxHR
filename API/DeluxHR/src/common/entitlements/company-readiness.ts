import { NotFoundException } from '@nestjs/common';
import {
  Feature,
  EmployeeStatus,
  EmployeePaymentDetailStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
export async function companyReadiness(db: PrismaService, orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      features: true,
      onboardingConfirmations: true,
      payrollSettings: true,
      _count: {
        select: {
          departments: true,
          workLocations: true,
          shifts: true,
          employees: true,
          leaveTypes: true,
        },
      },
    },
  });
  if (!org) throw new NotFoundException('Organization not found');
  const features = org.features.filter((f) => f.enabled).map((f) => f.feature);
  const leave = features.includes(Feature.LEAVE),
    attendance =
      features.includes(Feature.ATTENDANCE) ||
      features.includes(Feature.TIMESHEETS),
    payroll =
      features.includes(Feature.PAYROLL) ||
      features.includes(Feature.PAYSLIPS) ||
      features.includes(Feature.EARLY_PAY);
  const [
    admins,
    unverified,
    profiles,
    leavePolicies,
    holidays,
    activeEmployees,
    paymentDetails,
    latestEmployee,
  ] = await Promise.all([
    db.user.count({
      where: {
        organizationId: orgId,
        role: UserRole.COMPANY_ADMIN,
        isActive: true,
      },
    }),
    db.employee.count({
      where: {
        organizationId: orgId,
        status: {
          in: [EmployeeStatus.PENDING_VERIFICATION, EmployeeStatus.SUSPENDED],
        },
      },
    }),
    db.employeePayrollProfile.count({
      where: {
        organizationId: orgId,
        employee: { status: EmployeeStatus.ACTIVE },
        OR: [{ basicSalary: { gt: 0 } }, { hourlyRate: { gt: 0 } }],
      },
    }),
    db.leavePolicy.count({
      where: { organizationId: orgId, isActive: true, isDefault: true },
    }),
    db.companyPublicHoliday.count({ where: { organizationId: orgId } }),
    db.employee.count({
      where: { organizationId: orgId, status: EmployeeStatus.ACTIVE },
    }),
    db.employeePaymentDetail.findMany({
      where: {
        organizationId: orgId,
        status: EmployeePaymentDetailStatus.APPROVED,
        employee: { status: EmployeeStatus.ACTIVE },
      },
      select: { employeeId: true },
    }),
    db.employee.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  const confirmed = new Map(
    org.onboardingConfirmations.map((c) => [c.step, c.confirmedAt]),
  );
  const afterImport = (step: string) => {
    const at = confirmed.get(step);
    return !!at && (!latestEmployee || at >= latestEmployee.createdAt);
  };
  const filled = (value: string | null | undefined) =>
    typeof value === 'string' && value.trim().length > 0;
  const checks = [
    {
      key: 'companyProfile',
      ready: [
        org.name,
        org.legalName,
        org.email,
        org.phoneNumber,
        org.addressLine1,
        org.city,
        org.province,
        org.postalCode,
        org.country,
        org.timezone,
      ].every(filled),
      required: true,
    },
    {
      key: 'registration',
      ready:
        filled(org.registrationNumber) && (!payroll || filled(org.taxNumber)),
      required: true,
    },
    { key: 'branding', ready: !!org.logoStorageKey, required: true },
    { key: 'package', ready: true, required: false },
    { key: 'administrators', ready: admins > 0, required: true },
    { key: 'departments', ready: org._count.departments > 0, required: true },
    {
      key: 'workLocations',
      ready: org._count.workLocations > 0,
      required: attendance,
    },
    { key: 'shifts', ready: org._count.shifts > 0, required: attendance },
    { key: 'leaveTypes', ready: org._count.leaveTypes > 0, required: leave },
    { key: 'leavePolicies', ready: leavePolicies > 0, required: leave },
    {
      key: 'publicHolidays',
      ready: holidays > 0 || !!confirmed.get('PUBLIC_HOLIDAYS'),
      required: leave,
    },
    {
      key: 'payrollSettings',
      ready: !!org.payrollSettings,
      required: payroll,
    },
    {
      key: 'employees',
      ready: activeEmployees > 0 && unverified === 0,
      required: true,
    },
    {
      key: 'openingLeave',
      ready: afterImport('OPENING_LEAVE'),
      required: leave,
    },
    {
      key: 'openingPayroll',
      ready:
        afterImport('OPENING_PAYROLL') &&
        profiles >= activeEmployees &&
        new Set(paymentDetails.map((p) => p.employeeId)).size >=
          activeEmployees,
      required: payroll,
    },
  ];
  const required = checks.filter((c) => c.required),
    complete = required.filter((c) => c.ready);
  return {
    organizationId: orgId,
    status: org.status,
    ready: required.length === complete.length,
    progress: {
      completedSteps: complete.length,
      totalSteps: required.length,
      percentage: Math.round((complete.length / required.length) * 100),
    },
    checklist: checks,
    counts: {
      activeEmployees,
      unverifiedEmployees: unverified,
      departments: org._count.departments,
      locations: org._count.workLocations,
      shifts: org._count.shifts,
      leavePolicies,
      holidays,
      administrators: admins,
      payrollProfiles: profiles,
      approvedPaymentDetails: new Set(paymentDetails.map((p) => p.employeeId))
        .size,
    },
  };
}
