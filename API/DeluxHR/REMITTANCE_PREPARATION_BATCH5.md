# Ordinary & statutory remittance preparation — Banking Batch 5 / UI Batch 13

This cumulative delivery includes the earlier company banking, frozen payroll batches, platform Early Pay treasury and employer Early Pay repayments. The latest remittance workflow below supersedes older manual-register guidance about permitting overpayments or self-confirmation. It prepares and records payments; it does not send money or provide a bank-certified production file.

## Install and run

Preserve API `.env` and UI `.env.local`. Back up the database before replacing source and applying migrations. Extract API root `DeluxHR/` and UI root `deluxhr-web/` into their respective existing projects. Do not replace the other project or copy credentials from an archive.

API terminal:

```bash
cd /Users/siphiwezungu/Documents/DeluxHR/DeluxHR
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm run start:dev
```

UI terminal:

```bash
cd /Users/siphiwezungu/Documents/DeluxHR/deluxhr-web
npm ci
npm run test:remittances
npm run build
npm run dev -- --port 3001
```

API uses port 3000; UI uses 3001. The new migration is `20260930170000_remittance_payment_preparation`. It transactionally creates beneficiary profiles, frozen batches and allocation records, adds a nullable linked-allocation field to existing payment records, and adds status/value/checker checks. Composite organization foreign keys bind beneficiary, funding, batch, allocation and confirmed payment identities. Unique bank-result references per company and unique confirmed payment allocation links prevent replay. New financial history uses restrictive deletion. No legacy records are backfilled or deleted, and no tenant feature flags or subscriptions are enabled by this migration.

## Payment routes

| Route | Source | Preparation | External authorization |
| --- | --- | --- | --- |
| Ordinary bank transfer | Exact non-statutory code and creditor-name bucket | One approved creditor per batch; full available amount or smaller amount | Manually initiate and authorize in the company bank portal |
| SARS eFiling | PAYE, SDL, plus employee/employer UIF when registration says UIF is payable through SARS | One grouped declared payment and its official 19-digit EMP201 PRN | Official eFiling / credit-push process and banking authorization |
| Direct UIF / uFiling | Employee and employer UIF only | Official direct-UIF declaration/payment reference | Verified direct UIF route; only when UIF is not payable through SARS |
| Employer Early Pay repayment | Separate paid-payroll recovery register | Existing dedicated Early Pay repayment batch | Existing employer-to-DeluxHR repayment and incoming receipt workflow |

Statutory routes cannot store ordinary creditor banking fields or generate salary/creditor bank draft files. No hardcoded SARS/UIF account numbers are provided. Company administrators must verify registration documents; DeluxHR records their declaration and independent approval, without validating registration against government systems. Conflicting approved direct-UIF and SARS-including-UIF profiles are blocked, and only one approved profile per statutory route is allowed. SARS-only PAYE/SDL and direct-UIF may coexist only where verified registration supports that configuration.

The official declared payment must reconcile exactly to available ledger allocations before preparation. Declaration differences, such as applicable ETI credits, must be reviewed and represented by justified liability adjustments before using this workflow. This delivery does not calculate ETI, lodge EMP201/uFiling declarations, allocate government credits automatically or validate a PRN against SARS.

## Company setup

Company & Access → Remittance Beneficiaries creates immutable creditor accounts or statutory route profiles. The same component is available under the expandable **Remittance beneficiaries & statutory routing** section in Company Banking & Payments, including the onboarding banking tab for PENDING companies.

1. Company administrator creates a profile. Ordinary code and creditor name must exactly match a liability register bucket, including case; UNASSIGNED must be resolved/verified as an actual creditor before payment. Ordinary account number, branch, holder, type, bank and short payee reference are required. Statutory profiles require registration evidence and UIF routing declaration.
2. A different active company administrator inspects the profile with their password, then approves or rejects with their password and an audit reason. Lists mask account numbers. Approved profiles cannot be edited; retire and replace them for changed banking details.
3. Configure an approved company funding profile and LIABILITIES default in Company Banking & Payments, or choose an approved same-company funding override when preparing. Defaults affect future preparation; existing batch instructions remain frozen.
4. Cancel unsubmitted batches before retiring their beneficiary. Retired funding/beneficiary blocks further release or submission; previously submitted payments retain their frozen evidence.

Pending company administrators can configure profiles; financial preparation/release/submission is limited to ACTIVE companies with effective PAYROLL access. Configuring a profile does not grant PAYROLL or activate a company.

## Preparation, release and accounting

Open Payroll & Payments → Remittance Preparation. The month includes posted payroll whose period ends in the specified UTC calendar month (LOCKED, PAYMENT_PROCESSING and PAID, matching the existing ordinary/statutory register). Source currency must be ZAR. Early Pay recovery is excluded.

Available = outstanding liability − recorded/unconfirmed external payments − active batch reservations, floored at zero. Outstanding itself continues to mean liability minus confirmed payments. Preparation freezes funding, creditor/authority route, payment date and reference, declaration evidence, positive integer cents and exact bucket allocations. Maximum total is R10,000,000.00 per batch. Lists show the latest 100 batches for the selected month.

- **PREPARED** reserves the amount. A second user with organization-scoped APPROVE_PAYROLL_PAYMENTS verifies their password to release it.
- **APPROVED** permits audited inspection, preparation reports and eligible FNB test drafts. A PREPARE_PAYROLL_PAYMENTS user can cancel an unsubmitted PREPARED/APPROVED batch, releasing the reservation and retaining history.
- **SUBMITTED** records a payment already initiated/authorized externally. EXPORT_PAYROLL_PAYMENTS and password verification are required. The method must match the approved bank or statutory portal route, with a traceable submission reference and supporting evidence. This action does not send funds or mark liabilities paid.
- **PAID** requires an independent bank-result checker who is neither preparer nor submitter, password verification, traceable bank evidence, a nonfuture transaction date and actual paid cents equal to the frozen total. The transaction creates one linked CONFIRMED remittance accounting record per allocation. Only these confirmed records reduce outstanding liability.
- **FAILED** requires zero actual paid cents. **EXCEPTION** records a partial, uncertain or mismatched amount. Both retain reservations, create no confirmed accounting entries, and cannot be automatically cancelled or retried. Investigation/correction/reversal and controlled retry are follow-up work; do not prepare a substitute payment around the held amount.

Exact repeated final results are idempotent; changed evidence/date/amount/outcome conflicts rather than adding another payment. Case-normalized company bank-result references cannot be reused across new batches, and legacy external accounting references are checked case-insensitively before confirming a new result. The legacy register refuses records using a new batch result reference.

The ordinary manual remittance register now rejects overpayments and consumption of pending/reserved balances. Liability decreases cannot undercut confirmed, pending or reserved amounts. Confirming or voiding a manual recorded payment requires a different user and a reason of at least eight characters. UI mutations are shown only for organization-scoped MANAGE_PAYROLL. Both new and manual mutation paths serialize liability reservation/accounting changes and report reference/balance conflicts for refresh; new remittance mutations additionally recheck current actor role/activity, active company, effective organization permission and PAYROLL access inside their transaction. Audits are atomic with changes.

## Access and privacy

VIEW_PAYROLL with ORGANIZATION scope reads the workspace. PREPARE_PAYROLL_PAYMENTS prepares/cancels. APPROVE_PAYROLL_PAYMENTS releases/reconciles. EXPORT_PAYROLL_PAYMENTS inspects/downloads/records external submission. SELF/TEAM grants do not qualify. Beneficiary setup is COMPANY_ADMIN only. The grouped desktop/mobile menu and direct-route gate apply the same feature/permission rules; configuration remains available independently of PAYROLL entitlement. Platform administration is separate.

Workspace reads and reports mask accounts; full frozen details require password-verified audited inspection and private/no-store responses. Password and inspected details are cleared on selection changes, refresh, closing, blur and unmount; asynchronous inspection results are ignored after a context change. Bank accounts follow the existing application storage pattern; this delivery does not add database field encryption.

## Reports and bank file status

Preparation CSVs have separate remittance filenames, allocation amounts, route, status and official reference. CSV formula prefixes are neutralized and downloads audited with SHA256. These reports are not statutory returns or bank import files.

Only ordinary batches funded by approved FNB_OBE_BANKSERV version 2023-02 can generate the existing FNB test draft. Each contains one aggregated beneficiary credit. Adapter validation rejects unsupported lengths/characters instead of truncating. Drafts are explicitly named DRAFT-NOT-FOR-BANK-UPLOAD-REMITTANCE. The prior bank format ambiguity/uncertified status remains unresolved. Production export stays blocked for every bank product. Downloads do not transition statuses, send funds or create paid ledger records.

## API routes

`/remittance-beneficiaries`: authenticated company setup; pending onboarding allowed, service enforces COMPANY_ADMIN.
- GET: masked profiles.
- POST: immutable creditor/statutory profile.
- POST /:id/inspect: independent pending profile inspection, password/reason.
- POST /:id/review: independent decision APPROVED/REJECTED, password/reason.
- POST /:id/retire: approved profile retirement, password/reason; unsubmitted usage blocks retirement.

`/remittance-payments`: active tenant, PAYROLL feature and organization-scoped permission guards.
- GET /workspace?period=YYYY-MM: liability register, approved masked choices and latest period batches.
- GET /batches/:id: same-company masked frozen details.
- POST /batches: prepare from beneficiary and LIABILITIES funding default/override.
- POST /batches/:id/approve or /cancel: password/reason.
- POST /batches/:id/inspect: password/reason, full frozen instruction.
- POST /batches/:id/submit: password/reason, method, bankReference, evidence.
- POST /batches/:id/result: password/reason, outcome PAID/FAILED/MISMATCH, actualPaidCents, paidAt, bankReference, evidence.
- POST /batches/:id/report or /draft: separately named, no-store downloads with SHA256 header.
- POST /batches/:id/export: blocked until production bank adapters are verified.

## Validation and remaining acceptance

Prisma schema validation, client generation and API build passed. All 27 Jest suites / 290 tests passed. The 34 added tests cover exact/partial allocations, reservation conflicts, independent setup/release/result checks, current permissions/entitlements, tenant boundaries, statutory routing and reference/declaration reconciliation, replay protection, held failure/exception states, linked confirmed accounting, legacy external record conflicts, masked/escaped reports, draft state behavior, DTO validation and controller dependency registration. Targeted strict UI type/syntax checks and 15 mocked authenticated/no-store HTTP/download contracts passed. The portable UI contract test is included as `npm run test:remittances`.

Full Next build, browser/mobile E2E, actual migration/rollback/concurrency and bank/portal acceptance remain pending; no live database or financial payment was executed here. Unit transaction mocks do not establish PostgreSQL rollback/constraint behavior.

On a backed-up disposable database: apply all included migrations and check status; verify pending profile configuration, creator approval rejection, independent bank detail inspection/approval, conflicting UIF routes, cross-company IDs, feature-disabled/SELF/TEAM denial, funding default and frozen snapshot stability, available/reserved/pending balances, ordinary partial preparation, official SARS PRN/declaration equality, direct UIF eligibility, simultaneous preparation/manual payment conflicts, release/submission no-accounting effects, independent full-result allocation creation, repeat-result no-duplication, reference conflicts with old manual records, held failed/mismatch state, statutory draft denial, report/draft no-status behavior, hidden menus and account hiding. Review statutory registration/declaration evidence independently. Never use test drafts for live banking.

## Authoritative routing sources

Reviewed for this delivery on 30 September 2026:
- [SARS: completing EMP201](https://www.sars.gov.za/types-of-tax/pay-as-you-earn/completing-the-monthly-employer-declaration-emp201/)
- [SARS: payment reference number](https://www.sars.gov.za/faq/faq-what-is-a-payment-reference-number-prn/)
- [SARS: eFiling credit push](https://www.sars.gov.za/individuals/how-do-i-pay/efiling-payments-credit-push/)
- [SARS: payment rules](https://www.sars.gov.za/guide-to-sars-payment-rules/)
- [uFiling: how to declare and pay](https://ufiling.labour.gov.za/uif/how-to-declare-and-pay)

Next implementation work: controlled failed/mismatched payment correction and retry, and bank-product acceptance/serializer certification before enabling production uploads. Bulk ordinary creditors in a single bank file remain a later extension; this delivery prepares one ordinary beneficiary per batch.
