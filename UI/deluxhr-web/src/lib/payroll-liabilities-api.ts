import {
  workforceRequest as request,
  getAuthHeaders,
  handleResponse,
} from "./api";
export type LiabilityRow = {
  code: string;
  creditorName: string;
  category: string;
  effect: string;
  amountCents: number;
  adjustmentCents: number;
  paidCents: number;
  pendingCents: number;
  reservedCents: number;
  availableCents: number;
  outstandingCents: number;
  status:
    | "UNPAID"
    | "PAYMENT_RECORDED"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERPAID";
};
export type LiabilityAdjustment = {
  id: string;
  period: string;
  code: string;
  creditorName: string;
  amountCents: number;
  reason: string;
  createdByUserId: string;
  createdAt: string;
};
export type RemittancePayment = {
  id: string;
  period: string;
  code: string;
  creditorName: string;
  amountCents: number;
  reference: string;
  paidAt: string;
  status: "RECORDED" | "CONFIRMED" | "VOIDED";
  createdByUserId: string;
  createdAt: string;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  voidedAt: string | null;
  voidedByUserId: string | null;
  voidReason: string | null;
};
export type LiabilityRegister = {
  period: string;
  currency: "ZAR";
  runCount: number;
  rows: LiabilityRow[];
  totals: {
    reservedCents: number;
    availableCents: number;
    baseCents: number;
    adjustmentCents: number;
    paidCents: number;
    pendingCents: number;
    outstandingCents: number;
  };
  statutory: {
    payeCents: number;
    uifEmployeeCents: number;
    uifEmployerCents: number;
    uifTotalCents: number;
    sdlCents: number;
  };
  employeeDeductionsCents: number;
  employerContributionsCents: number;
  payrollTotals: {
    grossEarningsCents: number;
    netPayCents: number;
    employerCostCents: number;
  };
  adjustments: LiabilityAdjustment[];
  payments: RemittancePayment[];
};
export type LiabilityReconciliation = {
  period: string;
  checkedRuns: number;
  differences: {
    payrollRunId: string;
    code: string;
    expectedCents: number;
    ledgerCents: number;
    differenceCents: number;
  }[];
  balanced: boolean;
  unpaidCents: number;
  recordedUnconfirmedCents: number;
};
export type RemittanceHistory = {
  id: string;
  action: string;
  entityId: string;
  actorEmail: string | null;
  actorRole: string | null;
  actorUserId: string | null;
  reason: string | null;
  createdAt: string;
};
export type LiabilityBucket = {
  period: string;
  code: string;
  creditorName: string;
};
const query = (period: string) => new URLSearchParams({ period });
export const getLiabilityRegister = (period: string) =>
  request<LiabilityRegister>(`payroll-liabilities/register?${query(period)}`);
export const getLiabilityReconciliation = (period: string) =>
  request<LiabilityReconciliation>(
    `payroll-liabilities/reconciliation?${query(period)}`,
  );
export const getRemittanceHistory = (period: string) =>
  request<RemittanceHistory[]>(`payroll-liabilities/history?${query(period)}`);
export const createLiabilityAdjustment = (
  payload: LiabilityBucket & { amountCents: number; reason: string },
) =>
  request<LiabilityAdjustment>(
    "payroll-liabilities/adjustments",
    "POST",
    payload,
  );
export const recordRemittancePayment = (
  payload: LiabilityBucket & {
    amountCents: number;
    reference: string;
    paidAt: string;
  },
) =>
  request<RemittancePayment>("payroll-liabilities/payments", "POST", payload);
export const decideRemittancePayment = (
  id: string,
  status: "CONFIRMED" | "VOIDED",
  reason?: string,
) =>
  request<RemittancePayment>(
    `payroll-liabilities/payments/${encodeURIComponent(id)}`,
    "PATCH",
    { status, ...(reason ? { reason } : {}) },
  );
export const liabilityBucketKey = (
  row: Pick<LiabilityRow, "code" | "creditorName">,
) => JSON.stringify([row.code, row.creditorName]);
export const formatZarCents = (amount: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    amount / 100,
  );
// Parse user-entered rand without floating-point multiplication or implicit rounding.
export function parseZarCents(value: string, signed = false): number {
  const normalized = value.trim();
  if (
    !(signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(normalized)
  )
    throw new Error(
      "Enter a rand amount with up to two decimal places, without commas or currency symbols.",
    );
  const negative = normalized.startsWith("-");
  const [rand, fraction = ""] = normalized.replace(/^-/, "").split(".");
  const amount = Number(rand) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount === 0 || amount > 1000000000)
    throw new Error(
      "Amount must be nonzero and no more than R10,000,000.00 in magnitude.",
    );
  return negative ? -amount : amount;
}
export async function downloadLiabilityCsv(period: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/payroll-liabilities/export.csv?${query(period)}`,
    { headers: getAuthHeaders(), cache: "no-store" },
  );
  if (!response.ok)
    return handleResponse<never>(
      response,
      "Unable to export liability register",
    );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `DeluxHR-liabilities-${period}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
