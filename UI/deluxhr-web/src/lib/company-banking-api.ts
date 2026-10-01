import { workforceRequest } from "./api";
export type PaymentPurpose = "SALARIES" | "LIABILITIES" | "EARLY_PAY_REPAYMENT";
export type BankingAdapter = {
  id: string;
  bank: string;
  channel: string;
  format: string;
  version: string;
  specification: string;
  source: string;
  implementation: string;
  bankImportReady: boolean;
};
export type BankingProfile = {
  id: string;
  name: string;
  bank: string;
  channel: string;
  adapterId: string;
  adapterVersion: string;
  accountHolder: string;
  accountNumberMasked: string;
  branchCode: string;
  accountType: string;
  originatorId: string | null;
  ownReference: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "RETIRED";
  createdByUserId: string;
  decisionReason: string | null;
  adapter: BankingAdapter | null;
  bankImportReady: boolean;
};
export type BankingWorkspace = {
  profiles: BankingProfile[];
  defaults: { purpose: PaymentPurpose; profileId: string }[];
  adapters: BankingAdapter[];
  purposes: PaymentPurpose[];
};
export type NewBankingProfile = {
  name: string;
  adapterId: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
  originatorId?: string;
  ownReference: string;
  reason: string;
};
export const getCompanyBanking = () =>
  workforceRequest<BankingWorkspace>("company-banking");
export const createBankingProfile = (body: NewBankingProfile) =>
  workforceRequest<BankingProfile>("company-banking/profiles", "POST", body);
export const reviewBankingProfile = (
  id: string,
  decision: "APPROVED" | "REJECTED",
  password: string,
  reason: string,
) =>
  workforceRequest<BankingProfile>(
    `company-banking/profiles/${encodeURIComponent(id)}/review`,
    "POST",
    { decision, password, reason },
  );
export const retireBankingProfile = (id: string, reason: string) =>
  workforceRequest<BankingProfile>(
    `company-banking/profiles/${encodeURIComponent(id)}/retire`,
    "POST",
    { reason },
  );
export const setBankingDefault = (
  purpose: PaymentPurpose,
  profileId: string,
  reason: string,
) =>
  workforceRequest<unknown>("company-banking/defaults", "PUT", {
    purpose,
    profileId,
    reason,
  });
export const clearBankingDefault = (purpose: PaymentPurpose, reason: string) =>
  workforceRequest<unknown>(
    `company-banking/defaults/${encodeURIComponent(purpose)}/clear`,
    "POST",
    { reason },
  );

export const inspectBankingProfile = (
  id: string,
  password: string,
  reason: string,
) =>
  workforceRequest<{ accountNumber: string }>(
    `company-banking/profiles/${encodeURIComponent(id)}/inspect`,
    "POST",
    { password, reason },
  );
