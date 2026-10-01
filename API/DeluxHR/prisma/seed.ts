import 'dotenv/config';
import {
  EarningType,
  EmployeeStatus,
  PayrollItemStatus,
  PayrollRunStatus,
  PayslipStatus,
  PrismaClient,
  TimesheetStatus,
  UserRole,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const demoPassword = 'Password123!';

async function main() {
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  let organization = await prisma.organization.findFirst({
    where: { name: 'Demo Company' },
  });

  if (!organization) {
    organization = await prisma.organization.create({
      data: { name: 'Demo Company' },
    });
  }

  await prisma.payslipDelivery.deleteMany({});
  await prisma.payslip.deleteMany({ where: { organizationId: organization.id } });
  await prisma.earning.deleteMany({ where: { organizationId: organization.id } });
  await prisma.payrollRun.deleteMany({ where: { organizationId: organization.id } });
  await prisma.timesheetEntry.deleteMany({});
  await prisma.timesheet.deleteMany({ where: { organizationId: organization.id } });
  await prisma.attendanceRecord.deleteMany({ where: { organizationId: organization.id } });
  await prisma.leaveRequest.deleteMany({ where: { organizationId: organization.id } });
  await prisma.auditLog.deleteMany({ where: { organizationId: organization.id } });

  const owner = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {
      fullName: 'Demo Admin',
      passwordHash,
      role: UserRole.COMPANY_ADMIN,
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      fullName: 'Demo Admin',
      email: 'admin@demo.com',
      passwordHash,
      role: UserRole.COMPANY_ADMIN,
      organizationId: organization.id,
    },
  });

  const hrDept = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Human Resources',
      },
    },
    update: {},
    create: {
      name: 'Human Resources',
      organizationId: organization.id,
    },
  });

  const opsDept = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Operations',
      },
    },
    update: {},
    create: {
      name: 'Operations',
      organizationId: organization.id,
    },
  });

  const financeDept = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Finance',
      },
    },
    update: {},
    create: {
      name: 'Finance',
      organizationId: organization.id,
    },
  });

  const engineeringDept = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Engineering',
      },
    },
    update: {},
    create: {
      name: 'Engineering',
      organizationId: organization.id,
    },
  });

  const siphiwe = await prisma.employee.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: 'siphiwe.demo@deluxhr.com',
      },
    },
    update: {
      employeeNumber: 'EMP-000001',
      status: EmployeeStatus.ACTIVE,
      firstName: 'Siphiwe',
      lastName: 'Zungu',
      departmentId: hrDept.id,
      phoneNumber: '27605297419',
      whatsappNumber: '27605297419',
      whatsappOptInAt: new Date(),
    },
    create: {
      firstName: 'Siphiwe',
      lastName: 'Zungu',
      email: 'siphiwe.demo@deluxhr.com',
      employeeNumber: 'EMP-000001',
      status: EmployeeStatus.ACTIVE,
      organizationId: organization.id,
      departmentId: hrDept.id,
      phoneNumber: '27605297419',
      whatsappNumber: '27605297419',
      whatsappOptInAt: new Date(),
    },
  });

  const bonginkosi = await prisma.employee.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: 'bonginkosi.kwdm@gmail.com',
      },
    },
    update: {
      employeeNumber: 'EMP-000002',
      status: EmployeeStatus.ACTIVE,
      firstName: 'Bonginkosi',
      lastName: 'Mthethwa',
      departmentId: engineeringDept.id,
      phoneNumber: '27844718499',
      whatsappNumber: '27844718499',
      whatsappOptInAt: new Date(),
    },
    create: {
      firstName: 'Bonginkosi',
      lastName: 'Mthethwa',
      email: 'bonginkosi.kwdm@gmail.com',
      employeeNumber: 'EMP-000002',
      status: EmployeeStatus.ACTIVE,
      organizationId: organization.id,
      departmentId: engineeringDept.id,
      phoneNumber: '27844718499',
      whatsappNumber: '27844718499',
      whatsappOptInAt: new Date(),
    },
  });

  const nomsa = await prisma.employee.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: 'nomsa@demo.com',
      },
    },
    update: {
      employeeNumber: 'EMP-000003',
      status: EmployeeStatus.ACTIVE,
      departmentId: hrDept.id,
      phoneNumber: '27821234567',
      whatsappNumber: '27821234567',
      whatsappOptInAt: new Date(),
    },
    create: {
      firstName: 'Nomsa',
      lastName: 'Mthembu',
      email: 'nomsa@demo.com',
      employeeNumber: 'EMP-000003',
      status: EmployeeStatus.ACTIVE,
      organizationId: organization.id,
      departmentId: hrDept.id,
      phoneNumber: '27821234567',
      whatsappNumber: '27821234567',
      whatsappOptInAt: new Date(),
    },
  });

  const thabo = await prisma.employee.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: 'thabo@demo.com',
      },
    },
    update: {
      employeeNumber: 'EMP-000004',
      status: EmployeeStatus.ACTIVE,
      departmentId: opsDept.id,
      phoneNumber: '27827654321',
      whatsappNumber: '27827654321',
      whatsappOptInAt: new Date(),
    },
    create: {
      firstName: 'Thabo',
      lastName: 'Mokoena',
      email: 'thabo@demo.com',
      employeeNumber: 'EMP-000004',
      status: EmployeeStatus.ACTIVE,
      organizationId: organization.id,
      departmentId: opsDept.id,
      phoneNumber: '27827654321',
      whatsappNumber: '27827654321',
      whatsappOptInAt: new Date(),
    },
  });

  const lerato = await prisma.employee.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: 'lerato@demo.com',
      },
    },
    update: {
      employeeNumber: 'EMP-000005',
      status: EmployeeStatus.ACTIVE,
      departmentId: financeDept.id,
      phoneNumber: '27829876543',
      whatsappNumber: '27829876543',
      whatsappOptInAt: new Date(),
    },
    create: {
      firstName: 'Lerato',
      lastName: 'Khumalo',
      email: 'lerato@demo.com',
      employeeNumber: 'EMP-000005',
      status: EmployeeStatus.ACTIVE,
      organizationId: organization.id,
      departmentId: financeDept.id,
      phoneNumber: '27829876543',
      whatsappNumber: '27829876543',
      whatsappOptInAt: new Date(),
    },
  });

  const annualLeave = await prisma.leaveType.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Annual Leave',
      },
    },
    update: {},
    create: {
      name: 'Annual Leave',
      organizationId: organization.id,
    },
  });

  const sickLeave = await prisma.leaveType.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Sick Leave',
      },
    },
    update: {},
    create: {
      name: 'Sick Leave',
      organizationId: organization.id,
    },
  });

  const familyLeave = await prisma.leaveType.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Family Responsibility Leave',
      },
    },
    update: {},
    create: {
      name: 'Family Responsibility Leave',
      organizationId: organization.id,
    },
  });

  await prisma.leaveRequest.createMany({
    data: [
      {
        organizationId: organization.id,
        employeeId: siphiwe.id,
        leaveTypeId: annualLeave.id,
        startDate: new Date('2026-06-24'),
        endDate: new Date('2026-06-26'),
        status: 'PENDING',
      },
      {
        organizationId: organization.id,
        employeeId: bonginkosi.id,
        leaveTypeId: annualLeave.id,
        startDate: new Date('2026-05-13'),
        endDate: new Date('2026-05-15'),
        status: 'APPROVED',
      },
      {
        organizationId: organization.id,
        employeeId: nomsa.id,
        leaveTypeId: annualLeave.id,
        startDate: new Date('2026-05-04'),
        endDate: new Date('2026-05-08'),
        status: 'PENDING',
      },
      {
        organizationId: organization.id,
        employeeId: thabo.id,
        leaveTypeId: sickLeave.id,
        startDate: new Date('2026-04-20'),
        endDate: new Date('2026-04-21'),
        status: 'APPROVED',
      },
      {
        organizationId: organization.id,
        employeeId: lerato.id,
        leaveTypeId: familyLeave.id,
        startDate: new Date('2026-04-25'),
        endDate: new Date('2026-04-25'),
        status: 'REJECTED',
      },
    ],
  });

  const periodStart = new Date('2026-04-01');
  const periodEnd = new Date('2026-04-30');
  const paymentDate = new Date('2026-04-30');

  await prisma.attendanceRecord.createMany({
    data: [
      {
        organizationId: organization.id,
        employeeId: siphiwe.id,
        workDate: new Date('2026-04-22'),
        clockIn: new Date('2026-04-22T08:00:00+02:00'),
        clockOut: new Date('2026-04-22T17:00:00+02:00'),
      },
      {
        organizationId: organization.id,
        employeeId: siphiwe.id,
        workDate: new Date('2026-04-23'),
        clockIn: new Date('2026-04-23T08:10:00+02:00'),
        clockOut: new Date('2026-04-23T17:15:00+02:00'),
      },
      {
        organizationId: organization.id,
        employeeId: bonginkosi.id,
        workDate: new Date('2026-04-22'),
        clockIn: new Date('2026-04-22T07:45:00+02:00'),
        clockOut: new Date('2026-04-22T16:45:00+02:00'),
      },
      {
        organizationId: organization.id,
        employeeId: nomsa.id,
        workDate: new Date('2026-04-22'),
        clockIn: new Date('2026-04-22T08:00:00+02:00'),
        clockOut: new Date('2026-04-22T17:00:00+02:00'),
      },
      {
        organizationId: organization.id,
        employeeId: thabo.id,
        workDate: new Date('2026-04-22'),
        clockIn: new Date('2026-04-22T07:45:00+02:00'),
        clockOut: new Date('2026-04-22T16:45:00+02:00'),
      },
      {
        organizationId: organization.id,
        employeeId: lerato.id,
        workDate: new Date('2026-04-24'),
        clockIn: new Date('2026-04-24T08:30:00+02:00'),
        clockOut: null,
      },
    ],
  });

  const siphiweTimesheet = await prisma.timesheet.create({
    data: {
      organizationId: organization.id,
      employeeId: siphiwe.id,
      periodStart,
      periodEnd,
      totalHours: 18.08,
      totalDays: 2,
      status: TimesheetStatus.APPROVED,
      submittedAt: new Date('2026-04-25T10:00:00+02:00'),
      approvedAt: new Date('2026-04-26T09:00:00+02:00'),
      entries: {
        create: [
          {
            workDate: new Date('2026-04-22'),
            hoursWorked: 9,
            overtimeHours: 1,
            description: 'HR administration and payroll review',
          },
          {
            workDate: new Date('2026-04-23'),
            hoursWorked: 9.08,
            overtimeHours: 1.08,
            description: 'Employee support and leave management',
          },
        ],
      },
    },
  });

  await prisma.timesheet.create({
    data: {
      organizationId: organization.id,
      employeeId: bonginkosi.id,
      periodStart,
      periodEnd,
      totalHours: 9,
      totalDays: 1,
      status: TimesheetStatus.SUBMITTED,
      submittedAt: new Date('2026-04-25T11:00:00+02:00'),
      entries: {
        create: [
          {
            workDate: new Date('2026-04-22'),
            hoursWorked: 9,
            overtimeHours: 1,
            description: 'Engineering support shift',
          },
        ],
      },
    },
  });

  const siphiwePayrollRun = await prisma.payrollRun.create({
    data: {
      organizationId: organization.id,
      employeeId: siphiwe.id,
      title: 'April 2026 Payroll - Siphiwe Zungu',
      payPeriodStart: periodStart,
      payPeriodEnd: periodEnd,
      paymentDate,
      grossEarnings: 29500,
      totalDeductions: 0,
      taxableIncome: 29500,
      taxAmount: 5310,
      netPay: 24190,
      currency: 'ZAR',
      status: PayrollRunStatus.PAID,
      notes: `Generated from approved timesheet ${siphiweTimesheet.id}`,
    },
  });

  const bonginkosiPayrollRun = await prisma.payrollRun.create({
    data: {
      organizationId: organization.id,
      employeeId: bonginkosi.id,
      title: 'April 2026 Payroll - Bonginkosi Mthethwa',
      payPeriodStart: periodStart,
      payPeriodEnd: periodEnd,
      paymentDate,
      grossEarnings: 18500,
      totalDeductions: 0,
      taxableIncome: 18500,
      taxAmount: 3330,
      netPay: 15170,
      currency: 'ZAR',
      status: PayrollRunStatus.APPROVED,
      notes: 'Demo payroll run for WhatsApp and payslip walkthrough',
    },
  });

  await prisma.earning.createMany({
    data: [
      {
        organizationId: organization.id,
        employeeId: siphiwe.id,
        payrollRunId: siphiwePayrollRun.id,
        title: 'Monthly salary',
        type: EarningType.SALARY,
        source: 'PAYROLL',
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        earnedDate: paymentDate,
        amount: 28500,
        status: PayrollItemStatus.PROCESSED,
      },
      {
        organizationId: organization.id,
        employeeId: siphiwe.id,
        payrollRunId: siphiwePayrollRun.id,
        title: 'Overtime',
        type: EarningType.OVERTIME,
        source: 'TIMESHEET',
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        earnedDate: paymentDate,
        units: 2.08,
        rate: 480.77,
        amount: 1000,
        status: PayrollItemStatus.PROCESSED,
      },
      {
        organizationId: organization.id,
        employeeId: bonginkosi.id,
        payrollRunId: bonginkosiPayrollRun.id,
        title: 'Monthly salary',
        type: EarningType.SALARY,
        source: 'PAYROLL',
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        earnedDate: paymentDate,
        amount: 18000,
        status: PayrollItemStatus.PROCESSED,
      },
      {
        organizationId: organization.id,
        employeeId: bonginkosi.id,
        payrollRunId: bonginkosiPayrollRun.id,
        title: 'Overtime',
        type: EarningType.OVERTIME,
        source: 'TIMESHEET',
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        earnedDate: paymentDate,
        units: 1,
        rate: 500,
        amount: 500,
        status: PayrollItemStatus.PROCESSED,
      },
    ],
  });

  const siphiwePayslip = await prisma.payslip.create({
    data: {
      organizationId: organization.id,
      employeeId: siphiwe.id,
      payrollRunId: siphiwePayrollRun.id,
      payslipNumber: 'PS-2026-04-SIPHIWE',
      payPeriodStart: periodStart,
      payPeriodEnd: periodEnd,
      paymentDate,
      grossEarnings: 29500,
      totalDeductions: 0,
      taxableIncome: 29500,
      taxAmount: 5310,
      netPay: 24190,
      currency: 'ZAR',
      status: PayslipStatus.ISSUED,
      issuedAt: new Date('2026-04-30T09:00:00+02:00'),
      periodLabel: 'April 2026',
      pdfUrl: '/uploads/payslip-siphiwe-demo.pdf',
      notes: 'Demo payslip for WhatsApp employee self-service.',
    },
  });

  const bonginkosiPayslip = await prisma.payslip.create({
    data: {
      organizationId: organization.id,
      employeeId: bonginkosi.id,
      payrollRunId: bonginkosiPayrollRun.id,
      payslipNumber: 'PS-2026-04-BONGI',
      payPeriodStart: periodStart,
      payPeriodEnd: periodEnd,
      paymentDate,
      grossEarnings: 18500,
      totalDeductions: 0,
      taxableIncome: 18500,
      taxAmount: 3330,
      netPay: 15170,
      currency: 'ZAR',
      status: PayslipStatus.ISSUED,
      issuedAt: new Date('2026-04-30T09:05:00+02:00'),
      periodLabel: 'April 2026',
      pdfUrl: '/uploads/payslip-bonginkosi-demo.pdf',
      notes: 'Demo payslip for WhatsApp employee self-service.',
    },
  });

  await prisma.payslipDelivery.createMany({
    data: [
      {
        employeeId: siphiwe.id,
        payrollRunId: siphiwePayrollRun.id,
        payslipId: siphiwePayslip.id,
        pdfUrl: siphiwePayslip.pdfUrl ?? '',
        whatsappStatus: 'SENT',
        whatsappMessageId: 'wamid.demo-siphiwe-001',
        sentAt: new Date('2026-04-30T09:10:00+02:00'),
      },
      {
        employeeId: bonginkosi.id,
        payrollRunId: bonginkosiPayrollRun.id,
        payslipId: bonginkosiPayslip.id,
        pdfUrl: bonginkosiPayslip.pdfUrl ?? '',
        whatsappStatus: 'SENT',
        whatsappMessageId: 'wamid.demo-bonginkosi-001',
        sentAt: new Date('2026-04-30T09:15:00+02:00'),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { organizationId: organization.id, action: 'CREATE', entity: 'Organization', entityId: organization.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'User', entityId: owner.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'Employee', entityId: siphiwe.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'Employee', entityId: bonginkosi.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'LeaveType', entityId: annualLeave.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'LeaveRequest', entityId: siphiwe.id },
      { organizationId: organization.id, action: 'CLOCK_IN', entity: 'AttendanceRecord', entityId: siphiwe.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'Timesheet', entityId: siphiweTimesheet.id },
      { organizationId: organization.id, action: 'CREATE', entity: 'PayrollRun', entityId: siphiwePayrollRun.id },
      { organizationId: organization.id, action: 'ISSUE', entity: 'Payslip', entityId: siphiwePayslip.id },
      { organizationId: organization.id, action: 'SEND', entity: 'PayslipDelivery', entityId: siphiwePayslip.id },
    ],
  });

  console.log('Full demo seed created successfully');
  console.log('Login email: admin@demo.com');
  console.log(`Login password: ${demoPassword}`);
  console.log('WhatsApp demo employee: Siphiwe Zungu - 27605297419');
  console.log('WhatsApp demo employee: Bonginkosi Mthethwa - 27844718499');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });