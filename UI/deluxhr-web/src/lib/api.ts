const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_BASE_URL is not set');
}

type AuthUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type LoginResponse = {
  accessToken: string;
  user?: AuthUser;
};

type CreateDepartmentPayload = {
  name: string;
};

export type Department = {
  id: string;
  name: string;
  organizationId: string;
  createdAt?: string;
  updatedAt?: string;
};

type CreateEmployeePayload = {
  firstName: string;
  lastName: string;
  email: string;
  departmentId: string;
  phoneNumber: string;
  whatsappNumber?: string;
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  departmentId: string;
  userId?: string | null;
  phoneNumber?: string | null;
  whatsappNumber?: string | null;
  whatsappOptInAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  department?: {
    id: string;
    name: string;
  } | null;
};

type CreateLeaveTypePayload = {
  name: string;
};

export type LeaveType = {
  id: string;
  name: string;
  organizationId: string;
  createdAt?: string;
  updatedAt?: string;
};

type CreateLeaveRequestPayload = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
  employee?: Employee;
  leaveType?: LeaveType;
};

export type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  organizationId: string;
  createdAt?: string;
};

type ClockInPayload = {
  employeeId: string;
};

type ClockOutPayload = {
  attendanceId: string;
};

export type AttendanceRecord = {
  id: string;
  organizationId: string;
  employeeId: string;
  clockIn: string;
  clockOut?: string | null;
  workDate: string;
  createdAt: string;
  updatedAt: string;
  employee?: Employee;
};

export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type TimesheetEntry = {
  id: string;
  timesheetId: string;
  workDate: string;
  hoursWorked: number;
  overtimeHours: number;
  description?: string | null;
  projectCode?: string | null;
  taskCode?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Timesheet = {
  id: string;
  organizationId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalDays: number;
  status: TimesheetStatus;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  employee?: Employee;
  entries?: TimesheetEntry[];
};

export type CreateTimesheetPayload = {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
};

export type UpdateTimesheetStatusPayload = {
  status: TimesheetStatus;
};

export type CreateTimesheetEntryPayload = {
  timesheetId: string;
  workDate: string;
  hoursWorked: number;
  overtimeHours?: number;
  description?: string;
  projectCode?: string;
  taskCode?: string;
};

export type UpdateTimesheetEntryPayload = Partial<
  Omit<CreateTimesheetEntryPayload, 'timesheetId'>
>;

export type PayrollItemStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PROCESSED'
  | 'CANCELLED';

export type EarningType =
  | 'SALARY'
  | 'OVERTIME'
  | 'BONUS'
  | 'COMMISSION'
  | 'ALLOWANCE'
  | 'REIMBURSEMENT'
  | 'OTHER';

export type Earning = {
  id: string;
  organizationId: string;
  employeeId: string;
  payrollRunId?: string | null;
  title: string;
  type: EarningType;
  source?: string | null;
  payPeriodStart: string;
  payPeriodEnd: string;
  earnedDate: string;
  units?: number | null;
  rate?: number | null;
  amount: number;
  currency: string;
  status: PayrollItemStatus;
  createdAt?: string;
  updatedAt?: string;
  employee?: Employee;
};

export type UpdateEarningStatusPayload = {
  status: PayrollItemStatus;
};

export type PayrollLedgerEntry = {
  id: string;
  sequence: number;
  category: 'EARNING' | 'STATUTORY_DEDUCTION' | 'BENEFIT_DEDUCTION' | 'OTHER_DEDUCTION' | 'EARLY_PAY_RECOVERY' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYER_STATUTORY' | 'NET_PAY';
  effect: 'EMPLOYEE_EARNING' | 'EMPLOYEE_DEDUCTION' | 'EMPLOYER_COST' | 'EMPLOYER_LIABILITY' | 'NET_SETTLEMENT';
  code: string;
  description: string;
  amount: number;
  currency: string;
  creditorName?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type PayrollRun = {
  id: string;
  organizationId: string;
  employeeId: string;
  title?: string | null;
  payPeriodStart: string;
  payPeriodEnd: string;
  paymentDate?: string | null;
  grossEarnings: number;
  totalDeductions: number;
  taxableIncome: number;
  taxAmount: number;
  uifEmployee?: number;
  uifEmployer?: number;
  sdlEmployer?: number;
  employeeBenefitDeductions?: number;
  employerContributions?: number;
  recurringDeductions?: number;
  earlyPayRecovery?: number;
  totalEmployerCost?: number;
  taxYear?: string | null;
  calculationBreakdown?: Record<string, unknown> | null;
  netPay: number;
  currency: string;
  status: 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'APPROVED' | 'LOCKED' | 'PAYMENT_PROCESSING' | 'PAID' | 'CANCELLED';
  calculatedByUserId?: string | null; calculatedAt?: string | null; reviewedByUserId?: string | null; reviewedAt?: string | null; approvedByUserId?: string | null; approvedAt?: string | null; lockedByUserId?: string | null; lockedAt?: string | null; paymentProcessingByUserId?: string | null; paymentProcessingAt?: string | null; paidByUserId?: string | null; paidAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  employee?: Employee;
  earnings?: Earning[];
  payslip?: Payslip | null;
  ledgerEntries?: PayrollLedgerEntry[];

};

export type PayrollRunStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'LOCKED'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'CANCELLED';

export type UpdatePayrollRunStatusPayload = {
  status: PayrollRunStatus;
};

export type GeneratePayrollRunPayload = {
  employeeId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  paymentDate?: string;
  title?: string;
};

export type PayslipStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export type Payslip = {
  id: string;
  payslipNumber: string;
  status: PayslipStatus;
  generatedAt: string;
  issuedAt?: string | null;
  notes?: string | null;
  pdfUrl?: string | null;
  periodLabel?: string | null;
  organization?: {
    id: string;
    name: string;
  } | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  payroll?: {
    id: string;
    title?: string | null;
    payPeriodStart: string;
    payPeriodEnd: string;
    paymentDate?: string | null;
    currency: string;
    grossEarnings: number;
    totalDeductions: number;
    taxableIncome: number;
    taxAmount: number;
    netPay: number;
    status: PayrollRunStatus;
  } | null;
  earnings?: Earning[];
};

export type GeneratePayslipPayload = {
  payrollRunId: string;
  notes?: string;
};

export type UpdatePayslipStatusPayload = {
  status: PayslipStatus;
};

function clearAuthSession() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.cookie = 'deluxhr_token=; path=/; max-age=0; samesite=lax';
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(
  res: Response,
  fallbackMessage: string,
): Promise<T> {
  let data: unknown = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401) {
    clearAuthSession();

    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }

    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : fallbackMessage;

    throw new Error(message);
  }

  return data as T;
}

function ensureArray<T>(value: T[] | null | unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export async function loginUser({
  email,
  password,
}: LoginPayload): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  return handleResponse<LoginResponse>(res, 'Login failed');
}

export async function getDepartments(): Promise<Department[]> {
  const res = await fetch(`${API_BASE_URL}/departments`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Department[] | null>(
    res,
    'Failed to fetch departments',
  );

  return ensureArray<Department>(data);
}

export async function createDepartment({
  name,
}: CreateDepartmentPayload): Promise<Department> {
  const res = await fetch(`${API_BASE_URL}/departments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });

  return handleResponse<Department>(res, 'Failed to create department');
}

export async function getEmployees(): Promise<Employee[]> {
  const res = await fetch(`${API_BASE_URL}/employees`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Employee[] | null>(
    res,
    'Failed to fetch employees',
  );

  return ensureArray<Employee>(data);
}

export async function createEmployee({
  firstName,
  lastName,
  email,
  departmentId,
  phoneNumber,
  whatsappNumber,
}: CreateEmployeePayload): Promise<Employee> {
  const res = await fetch(`${API_BASE_URL}/employees`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      firstName,
      lastName,
      email,
      departmentId,
      phoneNumber,
      whatsappNumber,
    }),
  });

  return handleResponse<Employee>(res, 'Failed to create employee');
}

export type BulkEmployeeInput = CreateEmployeePayload;
export type BulkEmployeeResult = { imported: number; failed: number; errors: Array<{ row: number; email: string; message: string }>; employees: Employee[] };

export async function bulkCreateEmployees(employees: BulkEmployeeInput[]): Promise<BulkEmployeeResult> {
  const res = await fetch(`${API_BASE_URL}/employees/bulk`, {
    method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ employees }),
  });
  return handleResponse<BulkEmployeeResult>(res, 'Failed to bulk import employees');
}

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch(`${API_BASE_URL}/leave-types`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<LeaveType[] | null>(
    res,
    'Failed to fetch leave types',
  );

  return ensureArray<LeaveType>(data);
}

export async function createLeaveType({
  name,
}: CreateLeaveTypePayload): Promise<LeaveType> {
  const res = await fetch(`${API_BASE_URL}/leave-types`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });

  return handleResponse<LeaveType>(res, 'Failed to create leave type');
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const res = await fetch(`${API_BASE_URL}/leave-requests`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<LeaveRequest[] | null>(
    res,
    'Failed to fetch leave requests',
  );

  return ensureArray<LeaveRequest>(data);
}

export async function createLeaveRequest(
  payload: CreateLeaveRequestPayload,
): Promise<LeaveRequest> {
  const res = await fetch(`${API_BASE_URL}/leave-requests`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<LeaveRequest>(res, 'Failed to create leave request');
}

export async function updateLeaveRequestStatus(
  leaveRequestId: string,
  status: 'APPROVED' | 'REJECTED',
): Promise<LeaveRequest> {
  const res = await fetch(
    `${API_BASE_URL}/leave-requests/${leaveRequestId}/status`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    },
  );

  return handleResponse<LeaveRequest>(res, 'Failed to update leave request');
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE_URL}/audit-logs`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<AuditLog[] | null>(
    res,
    'Failed to fetch audit logs',
  );

  return ensureArray<AuditLog>(data);
}

export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
  const res = await fetch(`${API_BASE_URL}/attendance`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<AttendanceRecord[] | null>(
    res,
    'Failed to fetch attendance records',
  );

  return ensureArray<AttendanceRecord>(data);
}

export async function clockInEmployee({
  employeeId,
}: ClockInPayload): Promise<AttendanceRecord> {
  const res = await fetch(`${API_BASE_URL}/attendance/clock-in`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ employeeId }),
  });

  return handleResponse<AttendanceRecord>(res, 'Failed to clock in employee');
}

export async function clockOutEmployee({
  attendanceId,
}: ClockOutPayload): Promise<AttendanceRecord> {
  const res = await fetch(`${API_BASE_URL}/attendance/clock-out`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ attendanceId }),
  });

  return handleResponse<AttendanceRecord>(res, 'Failed to clock out employee');
}

export async function getTimesheets(): Promise<Timesheet[]> {
  const res = await fetch(`${API_BASE_URL}/timesheets`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Timesheet[] | null>(
    res,
    'Failed to fetch timesheets',
  );

  return ensureArray<Timesheet>(data);
}

export async function getTimesheetsByEmployee(
  employeeId: string,
): Promise<Timesheet[]> {
  const res = await fetch(`${API_BASE_URL}/timesheets/employee/${employeeId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Timesheet[] | null>(
    res,
    'Failed to fetch employee timesheets',
  );

  return ensureArray<Timesheet>(data);
}

export async function getTimesheet(id: string): Promise<Timesheet> {
  const res = await fetch(`${API_BASE_URL}/timesheets/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  return handleResponse<Timesheet>(res, 'Failed to fetch timesheet');
}

export async function createTimesheet(
  payload: CreateTimesheetPayload,
): Promise<Timesheet> {
  const res = await fetch(`${API_BASE_URL}/timesheets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<Timesheet>(res, 'Failed to create timesheet');
}

export async function updateTimesheetStatus(
  id: string,
  payload: UpdateTimesheetStatusPayload,
): Promise<Timesheet> {
  const res = await fetch(`${API_BASE_URL}/timesheets/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<Timesheet>(res, 'Failed to update timesheet status');
}

export async function createTimesheetEntry(
  payload: CreateTimesheetEntryPayload,
): Promise<TimesheetEntry> {
  const res = await fetch(`${API_BASE_URL}/timesheets/entries`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<TimesheetEntry>(
    res,
    'Failed to create timesheet entry',
  );
}

export async function updateTimesheetEntry(
  entryId: string,
  payload: UpdateTimesheetEntryPayload,
): Promise<TimesheetEntry> {
  const res = await fetch(`${API_BASE_URL}/timesheets/entries/${entryId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<TimesheetEntry>(
    res,
    'Failed to update timesheet entry',
  );
}

export async function deleteTimesheetEntry(entryId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/timesheets/entries/${entryId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  return handleResponse<void>(res, 'Failed to delete timesheet entry');
}

export async function getEarnings(): Promise<Earning[]> {
  const res = await fetch(`${API_BASE_URL}/earnings`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Earning[] | null>(
    res,
    'Failed to fetch earnings',
  );

  return ensureArray<Earning>(data);
}

export async function updateEarningStatus(
  id: string,
  payload: UpdateEarningStatusPayload,
): Promise<Earning> {
  const res = await fetch(`${API_BASE_URL}/earnings/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<Earning>(res, 'Failed to update earning status');
} 

export async function generatePayrollRun(
  payload: GeneratePayrollRunPayload,
): Promise<PayrollRun> {
  const res = await fetch(`${API_BASE_URL}/payroll-runs/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<PayrollRun>(res, 'Failed to generate payroll run');
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const res = await fetch(`${API_BASE_URL}/payroll-runs`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<PayrollRun[] | null>(
    res,
    'Failed to fetch payroll runs',
  );

  return ensureArray<PayrollRun>(data);
}

export async function updatePayrollRunStatus(
  id: string,
  payload: UpdatePayrollRunStatusPayload,
): Promise<PayrollRun> {
  const res = await fetch(`${API_BASE_URL}/payroll-runs/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<PayrollRun>(
    res,
    'Failed to update payroll run status',
  );
}

export async function recalculatePayrollRun(id: string): Promise<PayrollRun> {
  const res = await fetch(`${API_BASE_URL}/payroll-runs/${id}/recalculate`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });

  return handleResponse<PayrollRun>(res, 'Failed to recalculate payroll run');
}

export async function getPayslips(): Promise<Payslip[]> {
  const res = await fetch(`${API_BASE_URL}/payslips`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Payslip[] | null>(
    res,
    'Failed to fetch payslips',
  );

  return ensureArray<Payslip>(data);
}

export async function generatePayslip(
  payload: GeneratePayslipPayload,
): Promise<Payslip> {
  const res = await fetch(`${API_BASE_URL}/payslips/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<Payslip>(res, 'Failed to generate payslip');
}

export async function updatePayslipStatus(
  id: string,
  payload: UpdatePayslipStatusPayload,
): Promise<Payslip> {
  const res = await fetch(`${API_BASE_URL}/payslips/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  return handleResponse<Payslip>(res, 'Failed to update payslip status');
}

export function getPayslipPdfUrl(id: string) {
  return `${API_BASE_URL}/payslips/${id}/pdf`;
}

export async function downloadPayslipPdf(id: string) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const res = await fetch(`${API_BASE_URL}/payslips/${id}/pdf`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error('Failed to download payslip PDF');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `payslip-${id}.pdf`;
  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
}
export async function sendPayslipWhatsApp(id: string): Promise<{
  success: boolean;
  messageId?: string | null;
  pdfUrl?: string;
}> {
  const res = await fetch(`${API_BASE_URL}/payslips/${id}/send-whatsapp`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  return handleResponse(res, 'Failed to send payslip on WhatsApp');
}
export type EarlyPayPolicy = {
  id: string; enabled: boolean; minimumQualifyingDays: number; accessibleNetPercentage: number;
  minimumRequestAmount: number; maximumRequestAmount: number; maximumRequestsPerPeriod: number;
  paydayDay: number; paydayCutoffDays: number; estimatedPayeReserveRate: number; estimatedUifReserveRate: number;
  protectedDeductionRate: number; serviceFee: number; transactionFeePercentage: number; standardTransferFee: number; instantTransferFee: number;
};
export type EarlyPayRequestStatus = 'PENDING'|'APPROVED'|'REJECTED'|'PROCESSING'|'PAID'|'PAYMENT_FAILED'|'CANCELLED'|'RECOVERED';
export type EarlyPayRequest = {
  id: string; employeeId: string; requestedAmount: number; serviceFee: number; transferFee: number; instantFee: number;
  netDisbursement: number; totalPayrollRecovery: number; qualifyingDays: number; grossEarnedAtRequest: number;
  estimatedNetEarned: number; availableAmountAtRequest: number; transferType: 'STANDARD'|'INSTANT'; status: EarlyPayRequestStatus;
  requestedAt: string; paidAt?: string|null; recoveredAt?: string|null; paymentReference?: string|null; rejectionReason?: string|null;
  employee?: Employee & { department?: Department|null };
};
export type EarlyPayQuote = {
  eligible: boolean; reason?: string|null; reasons?: string[]; qualifyingDays: number; grossEarned: number; estimatedPaye: number;
  estimatedUif: number; protectedDeductions: number; estimatedNetEarned: number; accessiblePercentage: number; accessLimit: number;
  alreadyAccessed: number; availableAmount: number; payday: string; cutoff: string; policy: EarlyPayPolicy; taxNote: string;
};
export async function getEarlyPayPolicy(): Promise<EarlyPayPolicy> {
  const res = await fetch(`${API_BASE_URL}/early-pay/policy`, { headers: getAuthHeaders() });
  return handleResponse<EarlyPayPolicy>(res, 'Failed to fetch Early Pay policy');
}
export async function updateEarlyPayPolicy(payload: Partial<EarlyPayPolicy>): Promise<EarlyPayPolicy> {
  const res = await fetch(`${API_BASE_URL}/early-pay/policy`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) });
  return handleResponse<EarlyPayPolicy>(res, 'Failed to update Early Pay policy');
}
export async function getEarlyPayRequests(): Promise<EarlyPayRequest[]> {
  const res = await fetch(`${API_BASE_URL}/early-pay/requests`, { headers: getAuthHeaders() });
  return ensureArray(await handleResponse<EarlyPayRequest[]|null>(res, 'Failed to fetch Early Pay requests'));
}
export async function getEarlyPayQuote(employeeId: string): Promise<EarlyPayQuote> {
  const res = await fetch(`${API_BASE_URL}/early-pay/quote/${employeeId}`, { headers: getAuthHeaders() });
  return handleResponse<EarlyPayQuote>(res, 'Failed to calculate Early Pay');
}
export async function reviewEarlyPayRequest(id: string, status: 'APPROVED'|'REJECTED', reason?: string): Promise<EarlyPayRequest> {
  const res = await fetch(`${API_BASE_URL}/early-pay/requests/${id}/review`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status, reason }) });
  return handleResponse<EarlyPayRequest>(res, 'Failed to review Early Pay request');
}
export async function processEarlyPayPayment(id: string): Promise<EarlyPayRequest> {
  const res = await fetch(`${API_BASE_URL}/early-pay/requests/${id}/process-payment`, { method: 'POST', headers: getAuthHeaders() });
  return handleResponse<EarlyPayRequest>(res, 'Failed to process Early Pay payment');
}

export type PayFrequency='WEEKLY'|'FORTNIGHTLY'|'MONTHLY'; export type ContributionMethod='NONE'|'FIXED_AMOUNT'|'PERCENTAGE'; export type BenefitType='RETIREMENT_FUND'|'MEDICAL_AID'|'OTHER'; export type ContributionBasis='BASIC_SALARY'|'PENSIONABLE_SALARY'|'CUSTOM';
export type PayrollSettings={id:string;organizationId:string;payFrequency:PayFrequency;uifRegistered:boolean;sdlApplicable:boolean;approvalMode:'SINGLE_APPROVER'|'MAKER_CHECKER'};
export type BenefitPlan={id:string;name:string;type:BenefitType;providerName?:string|null;employeeMethod:ContributionMethod;employeeValue:number;employerMethod:ContributionMethod;employerValue:number;contributionBasis:ContributionBasis;active:boolean};
export type PayrollDeductionDefinition={id:string;name:string;creditorName?:string|null;active:boolean};
export type EmployeePayrollProfile={id:string;taxNumber?:string|null;dateOfBirth?:string|null;basicSalary:number;pensionableSalary?:number|null;hourlyRate?:number|null;payFrequency:PayFrequency;bankName?:string|null;bankAccountHolder?:string|null;bankAccountNumber?:string|null;bankBranchCode?:string|null;bankAccountType?:string|null;bankVerificationStatus:string;medicalAidDependants:number;benefits:Array<{id:string;membershipNumber?:string|null;benefitPlan:BenefitPlan}>;deductions:Array<{id:string;method:ContributionMethod;value:number;deductionDefinition:PayrollDeductionDefinition}>};
export type PayrollProfileEmployee=Employee&{payrollProfile?:EmployeePayrollProfile|null};
export async function getPayrollSettings(){const r=await fetch(`${API_BASE_URL}/payroll-configuration/settings`,{headers:getAuthHeaders()});return handleResponse<PayrollSettings>(r,'Failed to fetch payroll settings')}
export async function updatePayrollSettings(p:Partial<PayrollSettings>){const r=await fetch(`${API_BASE_URL}/payroll-configuration/settings`,{method:'PATCH',headers:getAuthHeaders(),body:JSON.stringify(p)});return handleResponse<PayrollSettings>(r,'Failed to update payroll settings')}
export async function getPayrollProfiles(){const r=await fetch(`${API_BASE_URL}/payroll-configuration/profiles`,{headers:getAuthHeaders()});return ensureArray(await handleResponse<PayrollProfileEmployee[]>(r,'Failed to fetch payroll profiles'))}
export async function updatePayrollProfile(employeeId:string,p:Partial<EmployeePayrollProfile>){const r=await fetch(`${API_BASE_URL}/payroll-configuration/profiles/${employeeId}`,{method:'PATCH',headers:getAuthHeaders(),body:JSON.stringify(p)});return handleResponse<EmployeePayrollProfile>(r,'Failed to save payroll profile')}
export async function getBenefitPlans(){const r=await fetch(`${API_BASE_URL}/payroll-configuration/benefits`,{headers:getAuthHeaders()});return ensureArray(await handleResponse<BenefitPlan[]>(r,'Failed to fetch benefit plans'))}
export async function createBenefitPlan(p:Omit<BenefitPlan,'id'|'active'>){const r=await fetch(`${API_BASE_URL}/payroll-configuration/benefits`,{method:'POST',headers:getAuthHeaders(),body:JSON.stringify(p)});return handleResponse<BenefitPlan>(r,'Failed to create benefit plan')}
export async function assignEmployeeBenefit(employeeId:string,p:{benefitPlanId:string;membershipNumber?:string}){const r=await fetch(`${API_BASE_URL}/payroll-configuration/profiles/${employeeId}/benefits`,{method:'POST',headers:getAuthHeaders(),body:JSON.stringify(p)});return handleResponse(r,'Failed to assign benefit')}
export async function getPayrollDeductions(){const r=await fetch(`${API_BASE_URL}/payroll-configuration/deductions`,{headers:getAuthHeaders()});return ensureArray(await handleResponse<PayrollDeductionDefinition[]>(r,'Failed to fetch deductions'))}
export async function createPayrollDeduction(p:{name:string;creditorName?:string}){const r=await fetch(`${API_BASE_URL}/payroll-configuration/deductions`,{method:'POST',headers:getAuthHeaders(),body:JSON.stringify(p)});return handleResponse<PayrollDeductionDefinition>(r,'Failed to create deduction')}
export async function assignEmployeeDeduction(employeeId:string,p:{deductionDefinitionId:string;method:ContributionMethod;value:number}){const r=await fetch(`${API_BASE_URL}/payroll-configuration/profiles/${employeeId}/deductions`,{method:'POST',headers:getAuthHeaders(),body:JSON.stringify(p)});return handleResponse(r,'Failed to assign deduction')}
