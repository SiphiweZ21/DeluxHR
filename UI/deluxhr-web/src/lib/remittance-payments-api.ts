import {
  workforceRequest as request,
  getAuthHeaders,
  handleResponse,
} from "./api";
import type { LiabilityRegister } from "./payroll-liabilities-api";
export type Beneficiary = {
  id: string;
  name: string;
  route: "BANK_TRANSFER" | "SARS_EFILING" | "UIF_PORTAL";
  code: string | null;
  creditorName: string | null;
  payeeReference: string | null;
  uifViaSars: boolean | null;
  registrationEvidence: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumberMasked: string | null;
  branchCode: string | null;
  accountType: string | null;
  status: string;
  createdBy: string;
  reviewedBy: string | null;
};
export type Account = {
  name: string;
  bank?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumberMasked?: string;
  branchCode?: string;
  adapterId?: string;
};
export type RemittanceBatch = {
  id: string;
  period: string;
  route: Beneficiary["route"];
  status: string;
  paymentDate: string;
  paymentReference: string;
  declarationEvidence: string | null;
  totalCents: number;
  actualPaidCents: number | null;
  preparedBy: string;
  approvedBy: string | null;
  submittedBy: string | null;
  submissionReference: string | null;
  submissionEvidence: string | null;
  resultReference: string | null;
  resultEvidence: string | null;
  funding: Account;
  beneficiary: Account;
  allocations: {
    id: string;
    code: string;
    creditorName: string;
    amountCents: number;
  }[];
};
export type Workspace = {
  register: LiabilityRegister;
  beneficiaries: Beneficiary[];
  funding: {
    id: string;
    name: string;
    bank: string;
    accountNumberMasked: string;
  }[];
  batches: RemittanceBatch[];
  bankImportReady: false;
};
export type Inspection = {
  funding: Record<string, string>;
  beneficiary: Record<string, string>;
  paymentReference: string;
  totalCents: number;
  route: Beneficiary["route"];
};
export type AuthAction = { password: string; reason: string };
export type Prepare = {
  period: string;
  beneficiaryId: string;
  fundingProfileId?: string;
  amountCents?: number;
  paymentDate: string;
  officialReference?: string;
  declaredPaymentCents?: number;
  declarationEvidence?: string;
  reason: string;
};
const base = "remittance-payments",
  profiles = "remittance-beneficiaries",
  id = encodeURIComponent;
export const getBeneficiaries = () => request<Beneficiary[]>(profiles);
export const createBeneficiary = (payload: Record<string, string | boolean>) =>
  request<Beneficiary>(profiles, "POST", payload);
export const inspectBeneficiary = (key: string, payload: AuthAction) =>
  request<Beneficiary & { accountNumber: string | null }>(
    `${profiles}/${id(key)}/inspect`,
    "POST",
    payload,
  );
export const reviewBeneficiary = (
  key: string,
  payload: AuthAction & { decision: "APPROVED" | "REJECTED" },
) => request<Beneficiary>(`${profiles}/${id(key)}/review`, "POST", payload);
export const retireBeneficiary = (key: string, payload: AuthAction) =>
  request<unknown>(`${profiles}/${id(key)}/retire`, "POST", payload);
export const getRemittanceWorkspace = (period: string) =>
  request<Workspace>(`${base}/workspace?${new URLSearchParams({ period })}`);
export const getRemittanceBatch = (key: string) =>
  request<RemittanceBatch>(`${base}/batches/${id(key)}`);
export const prepareRemittance = (payload: Prepare) =>
  request<RemittanceBatch>(`${base}/batches`, "POST", payload);
export const remittanceAction = (
  key: string,
  action: "approve" | "cancel",
  payload: AuthAction,
) =>
  request<RemittanceBatch>(
    `${base}/batches/${id(key)}/${action}`,
    "POST",
    payload,
  );
export const submitRemittance = (
  key: string,
  payload: AuthAction & {
    method: string;
    bankReference: string;
    evidence: string;
  },
) =>
  request<RemittanceBatch>(
    `${base}/batches/${id(key)}/submit`,
    "POST",
    payload,
  );
export const recordRemittanceResult = (
  key: string,
  payload: AuthAction & {
    outcome: "PAID" | "FAILED" | "MISMATCH";
    actualPaidCents: number;
    bankReference: string;
    evidence: string;
    paidAt: string;
  },
) =>
  request<RemittanceBatch>(
    `${base}/batches/${id(key)}/result`,
    "POST",
    payload,
  );
export const inspectRemittance = (key: string, payload: AuthAction) =>
  request<Inspection>(`${base}/batches/${id(key)}/inspect`, "POST", payload);
export async function downloadRemittance(key: string, draft = false) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/${base}/batches/${id(key)}/${draft ? "draft" : "report"}`,
    { method: "POST", headers: getAuthHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    await handleResponse(res, "Unable to download remittance file.");
    return;
  }
  const url = URL.createObjectURL(await res.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = draft
    ? `DRAFT-NOT-FOR-BANK-UPLOAD-REMITTANCE-${key}.txt`
    : `DeluxHR-remittance-preparation-${key}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
