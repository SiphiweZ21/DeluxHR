# Employer Early Pay repayment batches — Banking Batch 4 / UI Batch 12

This cumulative package contains the previous company banking, payroll banking and platform Early Pay treasury batches, plus a separate employer-to-DeluxHR repayment workflow. It does not send money, call a bank API or provide a bank-certified production file.

## Install
Preserve API .env and UI .env.local. Back up the database, replace source, then run in the API project:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm run start:dev
```

The new migration is `20260930160000_early_pay_repayments`. It creates repayment destination configuration, batches, allocation items and bank receipt records in a transaction. Foreign keys preserve financial history; composite keys bind company funding and receipt organization/receiving-account identity correctly. Check constraints protect amounts, statuses, cancellation allocation clearing and maker/checker decisions. Existing requests, payroll rows, feature flags and tenant subscriptions are not backfilled or changed by this migration. Earlier banking migrations remain included.

In the UI project:

```bash
npm ci
npm run build
npm run dev -- --port 3001
```

API remains 3000, UI 3001. API build and targeted UI checks passed in this workspace; perform the full Next build locally because UI dependencies were not installed here.

## Two distinct financial events
`EarlyPayRequest.RECOVERED` means the amount was deducted through payroll. It does not prove that DeluxHR received the employer's repayment. The new repayment batch tracks PREPARED → APPROVED → SUBMITTED → PARTIALLY_REPAID → REPAID. Only independently confirmed incoming bank receipts reduce the repayment balance. No receipt action changes request RECOVERED to another status.

The ordinary Payroll Liabilities register continues to exclude EARLY_PAY_RECOVERY. It now links to the separate Early Pay Repayments workspace. Separate downloads prevent mixing these recoveries with salaries or statutory/creditor remittances.

## Setup and company workflow
1. An active platform administrator opens Platform Administration → Employer repayments and configures the DeluxHR receiving account. Choose an existing independently approved platform treasury account; create/review accounts in Early Pay treasury. No company can supply or change DeluxHR beneficiary details. Changing this default affects future batches only.
2. The company configures an approved source account in Company & Access → Banking & Payments and assigns EARLY_PAY_REPAYMENT, or chooses an explicit approved same-company profile when preparing a batch.
3. In Payroll & Payments → Early Pay Repayments select the payroll period ending in the specified UTC month. Only PAID payroll ledger deductions with code/category EARLY_PAY_RECOVERY and effect EMPLOYEE_DEDUCTION are considered. LOCKED or PAYMENT_PROCESSING payroll is excluded.
4. A deduction must reference a matching same-company employee's Early Pay request with a confirmed PAID treasury payout item. Principal must equal the frozen payout amount and request net disbursement, and principal + fees must equal both the ledger deduction and request recovery total. SIM- historical payouts, unconfirmed payments, currency mismatch, conflicting payroll linkage, duplicate request sources and existing allocations are blocked with explanations.
5. PAID/RECOVERED request markers are accepted only with this paid-ledger and confirmed-payout proof. This allows genuine older paid runs whose recovery marker failed to update, without treating all approved requests or simulated payments as debts. Historical external payouts without confirmed treasury evidence are not automatically imported.
6. Select up to 500 eligible recoveries, the payment date and company funding default/override. Preparation freezes funding, DeluxHR beneficiary, amounts, principal/fees, employee identity, source ledger/request/run IDs and a unique ER payment reference. Two unique allocation keys reserve both the source ledger entry and Early Pay request, so another ledger or batch cannot pay the same recovery again. Maximum batch amount: R21,474,836.47. The initial register supports at most 1000 entries per month; larger periods need pagination before use. Lists show the latest 100 batches.
7. A different company user with organization-scoped APPROVE_PAYROLL_PAYMENTS verifies their password and approves release. Preparation uses PREPARE_PAYROLL_PAYMENTS; bank inspection/download/submission recording uses EXPORT_PAYROLL_PAYMENTS. VIEW_PAYROLL is required to read the workspace. SELF/TEAM grants do not qualify.
8. Download the separate recovery CSV report, or an FNB Bankserv test draft if the frozen company funding profile uses FNB_OBE_BANKSERV. The draft contains ONE aggregated credit to the frozen DeluxHR beneficiary, with the unique batch reference. It uses the earlier unverified FNB serializer; it is NOT FOR BANK UPLOAD. Reports contain no full bank accounts. Downloading never marks funds paid or received.
9. For the current manual route, use password-protected audited Inspect bank details after release. Enter the repayment manually in the company bank portal against the frozen beneficiary, amount and reference, following the bank's authorization process. Record that actual manual initiation with the bank reference and evidence description. This records SUBMITTED only; DeluxHR does not execute or verify the transfer. Full account details are kept in component memory and hidden on refresh, window blur, batch change and navigation. Inspection passwords are cleared after attempts.
10. A PREPARED/APPROVED batch can be cancelled before submission: source allocations are released and history remains. SUBMITTED/partially repaid/repaid batches cannot be cancelled or automatically retried. If a funding/receiving account is no longer approved before release/submission, cancel and reprepare using approved details.

This tenant workflow requires available PAYROLL, not current EARLY_PAY enablement: companies can settle historical recovery debt after disabling new Early Pay access. Tenant feature/subscription guards remain in force. Platform receipt recording can reconcile existing debts even if a tenant is suspended; it does not give that tenant access.

## DeluxHR incoming receipt workflow
1. A platform administrator selects the company batch in Employer repayments and records funds actually received into its frozen receiving account. Enter the positive amount in ZAR, received date, unique incoming bank transaction/statement-entry reference, traceable evidence description and reason, then verify the administrator's password.
2. Receipt records start RECORDED and reserve their amount; they do not reduce outstanding debt. Pending + confirmed amounts cannot exceed the batch total. Future receipt dates and fractional cents are rejected. The receipt reference is trimmed, whitespace-normalized and uppercased, and unique per DeluxHR receiving account across all companies/batches, preventing the same credit reference being reused under another employer.
3. Use a reference that identifies the actual incoming transaction. If the bank only displays the employer payment reference, include a traceable statement/date/line identifier so separate partial credits remain distinguishable. The evidence description is manual accounting evidence, not automatic bank verification; never include credentials.
4. A DIFFERENT active platform administrator checks the bank evidence and confirms or voids the receipt with password/reason. The recorder cannot decide their own receipt. CONFIRMED reduces the balance; partial confirmation makes PARTIALLY_REPAID, and the full confirmed total makes REPAID. VOIDED frees the pending receipt reservation without marking the debt repaid. Final decisions cannot be changed; repeated decisions return conflict instead of re-applying amounts.
5. Source allocations remain reserved after repayment. No automatic retry, refund, reversal, write-off, bank-return parser or receipt-file upload is implemented. Failed/returned employer payments and incorrect final receipt decisions require a future explicit audited recovery/correction workflow. Do not record unreceived or uncertain money to clear a balance.

The platform receiving account cannot be retired while it is the configured repayment default or while unsubmitted repayment batches use it. Change the default and cancel those batches first. Submitted historical batches retain the original receiving snapshot.

## Payroll recovery correction
When PayrollService advances a run to PAID, request recovery marking now occurs inside the same transaction as the run/history update. It selects ONLY request IDs actually present in that run's Early Pay deduction ledger, matching company and employee, rather than marking every PAID Early Pay request in the date range. This prevents an undeducted request being labelled RECOVERED and avoids a non-atomic gap. Existing historical rows are preserved.

## API contracts
Tenant base `/early-pay-repayments`, JWT + active tenant + PAYROLL feature + organization permission guards:
- GET /register?period=YYYY-MM: source eligibility/reasons, available cents, masked approved funding choices/current receiving account and company batch balances.
- GET /batches/:id: same-company masked snapshots, source items and receipt history/balances.
- POST /batches: period, ledgerEntryIds (1–500 distinct UUIDs), paymentDate, optional fundingProfileId, reason.
- POST /batches/:id/approve or /cancel: password + reason.
- POST /batches/:id/inspect: password + reason; released instructions only, private/no-store.
- POST /batches/:id/submit: password, reason, method MANUAL_BANK_PORTAL, bankReference, evidence.
- POST /batches/:id/report or /draft: authenticated separate report/test draft with no state transition, private/no-store and SHA-256 header.
- POST /batches/:id/export: explicitly blocked until a verified production adapter exists.

Platform base `/platform-admin/early-pay-repayments`, JWT + active unassociated platform-role guard:
- GET /: approved masked receiving choices, current default and latest 100 company batches/receipt balances.
- POST /destination: accountId, password, reason. Approved platform account only; audited previous account/default change.
- POST /batches/:id/receipts: positive integer amountCents, receivedAt, bankReference, evidence, password, reason. Amount reserved pending independent decision.
- POST /batches/:id/receipts/:receiptId/decision: decision CONFIRMED/VOIDED, password, reason. Receipt must belong to the selected batch and actor must differ from recorder.

Mutation transactions revalidate current active actors/organization permissions, use SERIALIZABLE isolation and a repayment advisory lock, and return 409 on unique/concurrency conflicts. Audits are atomic with changes; platform receipt decisions also produce company audit entries. No feature data, paid-service entitlements or subscriptions are automatically enabled.

## Validation and acceptance
Prisma schema validation and API build passed. All 26 Jest suites / 256 tests passed, including 55 new repayment tests covering source eligibility, frozen payout/ledger reconciliation, company scope, permission scopes, destination/defaults, snapshots, cancellation, duplicate allocation/reference protections, manual submission, independent partial/final receipts, voiding, overpayment checks, reports/drafts, DTOs and atomic exact payroll recovery links. AppModule dependency resolution includes both new controllers.
Targeted strict UI type/syntax checks and 13 mocked authenticated/no-store HTTP/download contracts passed, including exact action payloads, menu gating and distinct report/draft filenames. Full Next build, browser/mobile E2E, live migrations/rollback/concurrency, actual bank statement reconciliation and bank import testing remain pending. No live database or bank writes occurred.

Before production use, apply to a disposable database and test with two company payment administrators and two platform administrators: approved source/receiving configuration; genuine confirmed Early Pay payout and PAID payroll deduction; blocked simulated/unpaid/duplicate sources; independent company release; snapshot stability after default/name changes; cancellation/reallocation before submission; report/draft no-status behavior; manual submission; partial incoming receipts; recorder self-confirmation rejection; duplicate incoming reference rejection across employers using the same receiving account; independent void/confirm; exact final balance and company/platform audits. Confirm only actual incoming settled funds clear the debt. Check company menu/service visibility, inspection hiding and mobile layouts. Never upload an unverified test draft for live payments.

Next: ordinary/statutory liabilities and remittance payment preparation, with bank-specific serializer validation still outstanding. Early Pay failure/reversal/correction workflows remain explicit follow-up work.
