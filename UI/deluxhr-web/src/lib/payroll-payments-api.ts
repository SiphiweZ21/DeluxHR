import { workforceRequest, getAuthHeaders, handleResponse } from "./api";
export type PaymentBatch = {
  items?: {
    id: string;
    amount: number;
    frozenEmployeeName: string | null;
    employee?: { firstName: string; lastName: string };
    beneficiary: {
      accountNumberMasked: string | null;
      accountHolderName: string | null;
      branchCode: string | null;
      accountType: string | null;
      paymentReference: string | null;
    };
  }[];
  id: string;
  payrollBatchId: string;
  status: string;
  currency: string;
  totalAmount: number;
  employeeCount: number;
  exportSha256?: string | null;
  exportAdapterId?: string | null;
  paymentDateSnapshot?: string | null;
  funding?: {
    profileId: string;
    name: string;
    bank: string;
    adapterId: string;
    adapterVersion: string;
    accountNumberMasked: string;
  } | null;
  payrollBatch?: { title: string };
};
export type ExportCheck = {
  validation: {
    valid: boolean;
    issues: { severity: string; code: string; message: string }[];
  };
  adapter: {
    displayName: string;
    status: string;
    directlyBankImportable: boolean;
  };
};
export const listPaymentBatches = () =>
  workforceRequest<PaymentBatch[]>("payroll-payments/batches");
export const getPaymentBatch = (id: string) =>
  workforceRequest<PaymentBatch>(
    `payroll-payments/batches/${encodeURIComponent(id)}`,
  );
export const preparePaymentBatch = (id: string, fundingProfileId?: string) =>
  workforceRequest<PaymentBatch>(
    `payroll-payments/batches/${encodeURIComponent(id)}/prepare`,
    "POST",
    fundingProfileId ? { fundingProfileId } : {},
  );
export const approvePaymentBatch = (id: string) =>
  workforceRequest<PaymentBatch>(
    `payroll-payments/batches/${encodeURIComponent(id)}/approve-for-export`,
    "POST",
  );
export const checkPaymentExport = (id: string, adapter: string) =>
  workforceRequest<ExportCheck>(
    `payroll-payments/batches/${encodeURIComponent(id)}/export-validation/${encodeURIComponent(adapter)}`,
  );
export async function downloadPaymentFile(id: string, draft = false) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/payroll-payments/batches/${encodeURIComponent(id)}/${draft ? "draft/FNB_OBE_BANKSERV" : "report"}`,
    { method: "POST", headers: getAuthHeaders(), cache: "no-store" },
  );
  if (!response.ok) {
    await handleResponse(response, "Unable to download payment file.");
    return;
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = draft
    ? `DRAFT-NOT-FOR-BANK-UPLOAD-${id}.txt`
    : `DeluxHR-payment-report-${id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type PaymentCycle = {
  id: string;
  title: string;
  status: string;
  paymentDate: string;
};
export type FundingChoice = {
  id: string;
  name: string;
  bank: string;
  adapterId: string;
  accountNumberMasked: string;
};
export const getPaymentCycles = () =>
  workforceRequest<PaymentCycle[]>("payroll-batches");
export const getPaymentFunding = () =>
  workforceRequest<FundingChoice[]>("payroll-payments/funding-profiles");
