import {
  workforceRequest as request,
  getAuthHeaders,
  handleResponse,
} from "./api";
import type { NewLeavePolicy } from "./leave-api";
import type { TenantReadiness, PlatformIdentity } from "./platform-api";
export type SetupIdentity = PlatformIdentity & {
  organization: { id: string; name: string; status: string } | null;
};
export type SetupPosition = {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  isActive: boolean;
};
export type SetupLookups = {
  departments: SetupOption[];
  positions: SetupPosition[];
  employees: SetupEmployee[];
  leaveTypes: SetupOption[];
  policies: SetupOption[];
};
export const setupLookups = () =>
  request<SetupLookups>("customer-onboarding/lookups");
export const setupPosition = (p: {
  departmentId: string;
  name: string;
  code: string;
}) => request<SetupPosition>("customer-onboarding/positions", "POST", p);
export const retirePosition = (id: string) =>
  request<SetupPosition>(
    `customer-onboarding/positions/${encodeURIComponent(id)}/retire`,
    "POST",
  );
export const setupCreateEmployee = (p: Record<string, string>) =>
  request<SetupEmployee>("customer-onboarding/employees", "POST", p);
export type SetupOption = { id: string; name: string };
export type SetupEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  departmentId: string;
  positionId?: string;
  jobTitle?: string;
  employmentType?: string;
  employmentStartDate?: string;
  identityType?: string;
  identityNumber?: string;
  createdByUserId?: string;
};
export type ImportEmployee = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  departmentId: string;
  whatsappNumber?: string;
  positionId?: string;
  jobTitle?: string;
  employmentType?: string;
  employmentStartDate?: string;
  employmentEndDate?: string;
  identityType?: string;
  identityNumber?: string;
};
export type ImportResult = {
  imported: number;
  failed: number;
  errors: { row: number; email: string; message: string }[];
  employees: SetupEmployee[];
};
export type PaymentDetail = {
  id: string;
  employeeId: string;
  status: string;
  maskedAccountNumber: string;
  bankName: string;
};
export const setupIdentity = () => request<SetupIdentity>("auth/me");
export const setupReadiness = () =>
  request<TenantReadiness>("customer-onboarding/readiness");
export const setupProfile = (p: Record<string, string>) =>
  request<Record<string, unknown>>("customer-onboarding/profile", "PATCH", p);
export const setupDepartment = (name: string) =>
  request<SetupOption>("customer-onboarding/departments", "POST", { name });
export const setupLocation = (p: Record<string, unknown>) =>
  request<SetupOption>("customer-onboarding/locations", "POST", p);
export const setupShift = (p: {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
}) => request<SetupOption>("customer-onboarding/shifts", "POST", p);
export const setupLeaveType = (name: string) =>
  request<SetupOption>("customer-onboarding/leave-types", "POST", { name });
export const setupLeavePolicy = (p: NewLeavePolicy) =>
  request<SetupOption>("customer-onboarding/leave-policies", "POST", p);
export const setupLeaveAssignment = (p: {
  employeeId: string;
  policyId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}) =>
  request<{ id: string }>("customer-onboarding/leave-assignments", "POST", p);
export const setupHoliday = (p: { name: string; date: string }) =>
  request<SetupOption>("customer-onboarding/holidays", "POST", p);
export const setupAdministrator = (p: {
  fullName: string;
  email: string;
  password: string;
}) =>
  request<{ id: string; email: string }>(
    "customer-onboarding/administrators",
    "POST",
    { ...p, role: "COMPANY_ADMIN" },
  );
export const setupImport = (employees: ImportEmployee[]) =>
  request<ImportResult>("customer-onboarding/employees/bulk", "POST", {
    employees,
  });
export const setupEmployee = (id: string, p: Record<string, string>) =>
  request<SetupEmployee>(
    `customer-onboarding/employees/${encodeURIComponent(id)}`,
    "PATCH",
    p,
  );
export const setupActivateEmployee = (id: string) =>
  request<SetupEmployee>(
    `customer-onboarding/employees/${encodeURIComponent(id)}/activate`,
    "POST",
  );
export const setupPayrollSettings = (p: {
  payFrequency: string;
  approvalMode: string;
  uifRegistered: boolean;
  sdlApplicable: boolean;
}) => request<unknown>("customer-onboarding/payroll-settings", "PATCH", p);
export const setupPayrollProfile = (
  id: string,
  p: Record<string, string | number>,
) =>
  request<unknown>(
    `customer-onboarding/opening-payroll/${encodeURIComponent(id)}`,
    "PATCH",
    p,
  );
export const setupOpeningLeave = (p: {
  employeeId: string;
  leaveTypeId: string;
  days: number;
  effectiveDate: string;
  reason: string;
}) =>
  request<{ id: string }>("customer-onboarding/opening-leave", "POST", {
    ...p,
    type: "OPENING",
  });
export const setupPayment = (id: string, p: Record<string, string>) =>
  request<PaymentDetail>(
    `customer-onboarding/opening-payroll/${encodeURIComponent(id)}/payment-details`,
    "POST",
    p,
  );
export const setupApprovePayment = (
  employeeId: string,
  paymentId: string,
  password: string,
) =>
  request<PaymentDetail>(
    `customer-onboarding/opening-payroll/${encodeURIComponent(employeeId)}/payment-details/${encodeURIComponent(paymentId)}/approve`,
    "POST",
    { password },
  );
export type ConfirmationStep =
  | "PUBLIC_HOLIDAYS"
  | "OPENING_LEAVE"
  | "OPENING_PAYROLL";
export const setupConfirm = (step: ConfirmationStep, note?: string) =>
  request<{ id: string; confirmedAt: string }>(
    `customer-onboarding/confirm/${step}`,
    "POST",
    { note },
  );
export async function setupUploadLogo(file: File) {
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size === 0 ||
    file.size > 2 * 1024 * 1024
  )
    throw new Error("Choose a PNG or JPEG between 1 byte and 2 MB.");
  const headers = new Headers(getAuthHeaders());
  headers.delete("Content-Type");
  const body = new FormData();
  body.append("file", file);
  return handleResponse<{ uploaded: boolean }>(
    await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/customer-onboarding/logo`,
      { method: "POST", headers, body },
    ),
    "Unable to upload company logo",
  );
}
export async function setupLogoBlob() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/customer-onboarding/logo`,
    { headers: getAuthHeaders(), cache: "no-store" },
  );
  if (!res.ok) return handleResponse<never>(res, "Unable to load company logo");
  return res.blob();
}
// RFC-style quoted fields, escaped quotes and embedded newlines; header order may vary.
export function parseEmployeeCsv(
  source: string,
  lookups?: Pick<SetupLookups, "departments" | "positions">,
): ImportEmployee[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const value = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) {
      if (c === '"') {
        if (value[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"') {
      if (field || closed) throw new Error("Malformed quote in CSV.");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r") {
      row.push(field.trim());
      field = "";
      closed = false;
      if (c !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === "\r" && value[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closed) throw new Error("Unexpected text after a quoted CSV field.");
    field += c;
  }
  if (quoted) throw new Error("Unclosed quoted field in CSV.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() ?? [],
    required = ["firstName", "lastName", "email", "phoneNumber"],
    allowed = [
      ...required,
      "departmentId",
      "departmentName",
      "positionId",
      "positionCode",
      "whatsappNumber",
      "jobTitle",
      "employmentType",
      "employmentStartDate",
      "employmentEndDate",
      "identityType",
      "identityNumber",
    ];
  if (
    new Set(headers).size !== headers.length ||
    required.some((h) => !headers.includes(h)) ||
    headers.some((h) => !allowed.includes(h)) ||
    (!headers.includes("departmentId") && !headers.includes("departmentName"))
  )
    throw new Error(
      "Use template headers, including departmentName or departmentId.",
    );
  if (!rows.length || rows.length > 1000)
    throw new Error("Import must contain between 1 and 1000 employees.");
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`CSV row ${index + 2} has the wrong number of fields.`);
    const item = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    if (required.some((h) => !item[h]))
      throw new Error(`CSV row ${index + 2} has a missing required value.`);
    if (item.departmentName) {
      const matches =
        lookups?.departments.filter(
          (d) => d.name.toLowerCase() === item.departmentName.toLowerCase(),
        ) ?? [];
      if (matches.length !== 1)
        throw new Error(
          `CSV row ${index + 2}: department name is missing or ambiguous. Refresh saved lookups.`,
        );
      if (item.departmentId && item.departmentId !== matches[0].id)
        throw new Error(`CSV row ${index + 2}: department ID/name conflict.`);
      item.departmentId = matches[0].id;
    }
    if (item.positionCode) {
      const matches =
        lookups?.positions.filter(
          (p) =>
            p.departmentId === item.departmentId &&
            p.isActive &&
            p.code.toLowerCase() === item.positionCode.toLowerCase(),
        ) ?? [];
      if (matches.length !== 1)
        throw new Error(
          `CSV row ${index + 2}: no active position code in this department.`,
        );
      if (item.positionId && item.positionId !== matches[0].id)
        throw new Error(`CSV row ${index + 2}: position ID/code conflict.`);
      item.positionId = matches[0].id;
    }
    delete item.departmentName;
    delete item.positionCode;
    for (const key of Object.keys(item)) if (!item[key]) delete item[key];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.departmentId,
      )
    )
      throw new Error(`CSV row ${index + 2} needs a department UUID.`);
    item.email = item.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))
      throw new Error(`CSV row ${index + 2} has an invalid email.`);
    if (seen.has(item.email))
      throw new Error(`CSV row ${index + 2} duplicates an email.`);
    seen.add(item.email);
    return item as ImportEmployee;
  });
}

export type SetupDocument = {
  id: string;
  documentType: string;
  originalFileName: string;
  fileSizeBytes: number;
  status: string;
  validityStatus: string;
  uploadedByUserId: string;
  issuedAt: string | null;
  expiresAt: string | null;
};
export const setupDocuments = (employee: string) =>
  request<SetupDocument[]>(
    `customer-onboarding/employees/${encodeURIComponent(employee)}/documents`,
  );
export const setupDocumentDecision = (
  employee: string,
  id: string,
  decision: "verify" | "reject",
  reason?: string,
) =>
  request<SetupDocument>(
    `customer-onboarding/employees/${encodeURIComponent(employee)}/documents/${encodeURIComponent(id)}/${decision}`,
    "POST",
    decision === "reject" ? { reason } : {},
  );
export async function setupUploadDocument(
  employee: string,
  file: File,
  metadata: Record<string, string>,
) {
  if (
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type) ||
    !file.size ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PDF, PNG or JPEG between 1 byte and 10 MB.");
  const headers = new Headers(getAuthHeaders());
  headers.delete("Content-Type");
  const body = new FormData();
  body.append("file", file);
  for (const [k, v] of Object.entries(metadata)) if (v) body.append(k, v);
  return handleResponse<SetupDocument>(
    await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/customer-onboarding/employees/${encodeURIComponent(employee)}/documents`,
      { method: "POST", headers, body, cache: "no-store" },
    ),
    "Unable to store employee document",
  );
}
export async function setupDownloadDocument(
  employee: string,
  d: SetupDocument,
) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/customer-onboarding/employees/${encodeURIComponent(employee)}/documents/${encodeURIComponent(d.id)}/file`,
    { headers: getAuthHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    await handleResponse(res, "Unable to download employee document");
    return;
  }
  const url = URL.createObjectURL(await res.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = d.originalFileName.replace(/[^A-Za-z0-9._ -]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type CompanySetupDocument = {
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  employeeId: string | null;
  officerGrade: string | null;
  assessmentAmount: string | null;
  assessmentPeriod: string | null;
  liabilityPeriod: string | null;
  validity: { status: string; daysUntilExpiry: number | null };
  id: string;
  category: string;
  originalFileName: string;
  fileSizeBytes: number;
  status: string;
  uploadedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
};
export const setupCompanyDocuments = () =>
  request<CompanySetupDocument[]>("customer-onboarding/documents");
export const setupCompanyDocumentDecision = (
  id: string,
  status: "VERIFIED" | "REJECTED",
  reason: string,
) =>
  request<unknown>(
    `customer-onboarding/documents/${encodeURIComponent(id)}/decision`,
    "POST",
    { status, reason },
  );
export async function setupUploadCompanyDocument(
  file: File,
  category: string,
  metadata: Record<string, string> = {},
) {
  if (
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type) ||
    !file.size ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PDF, PNG or JPEG between 1 byte and 10 MB.");
  const headers = new Headers(getAuthHeaders());
  headers.delete("Content-Type");
  const body = new FormData();
  body.append("file", file);
  body.append("category", category);
  for (const [key, value] of Object.entries(metadata))
    if (value.trim()) body.append(key, value.trim());
  return handleResponse<CompanySetupDocument>(
    await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/customer-onboarding/documents`,
      { method: "POST", headers, body, cache: "no-store" },
    ),
    "Unable to store company document",
  );
}
export async function setupDownloadCompanyDocument(d: CompanySetupDocument) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/customer-onboarding/documents/${encodeURIComponent(d.id)}/file`,
    { headers: getAuthHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    await handleResponse(res, "Unable to download company document");
    return;
  }
  const url = URL.createObjectURL(await res.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = d.originalFileName.replace(/[^A-Za-z0-9._ -]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const setupEmployeeProfile = (id: string) =>
  request<
    SetupEmployee & { phoneNumber: string; employmentEndDate: string | null }
  >(`customer-onboarding/employees/${encodeURIComponent(id)}`);

export const setupCompanyProfile = () =>
  request<Record<string, unknown>>("customer-onboarding/profile");
