# Early Pay treasury — Batch 3 / UI Batch 11

This is a cumulative API/UI delivery. Earlier payroll banking and company banking work remains included. Current bank exports are still not certified; this batch does not send money or call a bank API.

## Install
Preserve API `.env` and UI `.env.local`, back up the database, replace project source, then in the API directory:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm run start:dev
```

The new migration is `20260930150000_early_pay_treasury`. It creates three tables and constraints transactionally: platform funding accounts, payout batches and payout items. It adds no tenant entitlements, does not change existing request data, and does not backfill historical simulated payments. Prior banking migrations remain included.

In the UI directory:

```bash
npm ci
npm run build
npm run dev -- --port 3001
```

API: 3000; UI: 3001. Full UI installation/build must be performed locally; dependencies were unavailable in the development workspace.

## Operational workflow
1. Sign in with an active SUPER_ADMIN or PLATFORM_ADMIN account with no organization association. Open Platform Administration → Early Pay treasury. Company accounts cannot enter this workspace. Existing platform user administration can create a second platform administrator; no new finance role or automatic privilege grant is added.
2. Submit a platform-owned funding account using the bank/product catalog. Configuration is immutable. An independent platform administrator inspects the account using their password, then approves/rejects it with a reason. Inspection is audited and private/no-store. Funding-account approval is an internal control, not bank ownership validation. Tenant funding accounts remain separate.
3. Choose approved Early Pay requests, the approved funding account and a payment date. Preparation validates ACTIVE company/employee, enabled PAYROLL + EARLY_PAY, subscription availability/package inclusion when subscribed, current approved unsuperseded employee payment details, distinct requests and positive two-decimal ZAR amounts. The picker lists up to 500 approved/unallocated requests; preparation rechecks eligibility even if the picker contains a subsequently disabled company. Amounts are frozen as integer cents, along with beneficiary, funding, transfer preference, employee identity and unique payment reference. Each batch supports up to 500 items and R21,474,836.47 total.
4. Preparation reserves each request and sets PROCESSING. A second platform administrator approves release with password and reason. The API rechecks current request/company/employee/service eligibility and the funding-account approval. The preparer cannot release their own batch.
5. Download a masked CSV report or an FNB Bankserv test draft when the frozen account uses that adapter. Neither download advances payment status. FNB layout validation may block long beneficiary names or unsupported details. The shared serializer now accepts a bank-payment input without invented payroll run/cycle identities. The draft uses the same unverified layout as the previous batch; do not upload it for payment. Production export is explicitly rejected until bank validation is complete.
6. For the current manual route, inspect released payout details with password/reason, then enter payments manually into the bank portal against those frozen instructions and follow the bank's authorization process. Record that completed bank submission in DeluxHR with a traceable bank reference/evidence description. This API action records submission only; it does not execute a payment, verify a bank response or automatically settle the batch. Instant requests depend on the actual banking product; this batch cannot guarantee instant delivery.
7. A platform administrator who is neither the preparer nor the submission recorder confirms each FINAL bank outcome with password, bank reference, evidence description and reason. Use PAID only for settled/paid funds; bank acceptance or pending processing is insufficient. These are manually attested bank results, not automated bank verification. No bank document upload or status-feed parser is included. A different checker can confirm some items while others stay pending.
8. Confirmed PAID sets the request PAID, paidAt and actual bank reference, enabling the existing payroll recovery flow. Confirmed FAILED sets PAYMENT_FAILED and keeps the allocation reserved; no automatic retry/reallocation occurs. The batch becomes RECONCILED when every item has a final result, even if some failed. Repeating an identical result is idempotent; conflicting final outcomes are rejected. An explicit audited failure-recovery/correction workflow is a later task.
9. Before submission, cancellation preserves batch/item history, clears active allocations and returns PROCESSING requests to APPROVED. Submitted batches cannot be cancelled. Retiring a funding account requires cancellation of all unsubmitted batches that use it. Historical snapshots remain unchanged.

With two administrators, use administrator A to prepare/record manual submission and administrator B to release/confirm results. If B records submission instead, confirmation requires another independent administrator because A is the preparer.

## Security and duplicate controls
- JWT + current database platform-role guard on every endpoint; mutations also lock/revalidate the active platform user in the transaction.
- SERIALIZABLE transactions, a treasury advisory lock, request row locks and a unique activeRequestId prevent simultaneous allocation. Database checks enforce positive amounts, valid statuses, independent funding/batch approvals and final result metadata. Concurrency/unique conflicts return HTTP 409 for refresh/retry.
- Treasury transactions have a 30-second timeout; a failed transaction must not be interpreted as a bank action.
- Ordinary API responses contain masked accounts; full accounts are available only through password-protected audited inspection or the authenticated release-approved test draft. Reports are masked and escape spreadsheet formula prefixes.
- Full inspection details are kept only in component memory and hidden on refresh, selection changes, window blur, tab switch and navigation. Password/account entry is cleared after actions. Bank account storage follows the project's existing plaintext database storage; field-level encryption and external vault integration are not newly implemented.
- Platform and organization result audits are atomic with state changes. Submission and item evidence text is retained for review; use traceable references, never credentials.
- Tenant request reviews use a guarded PENDING update in an atomic review/audit transaction, preventing stale reviewers from overwriting a reserved or paid request.

## Removed simulation and historical data
The old POST early-pay/:id/process endpoint remains as a clear HTTP 400 rejection for older clients. It cannot simulate payment or write PAID. The tenant Early Pay UI now says Await platform treasury / Treasury processing, and identifies existing SIM- payment references as legacy simulated payments. Historical simulated PAID/RECOVERED rows are preserved and excluded from new treasury preparation. The existing payroll code still treats historical PAID rows according to its previous behavior; review legacy SIM- records before real payroll recovery. This delivery does not assert that old simulated records represent actual transfers or silently rewrite historical payroll.

## API contracts
All routes are under `/platform-admin/early-pay-treasury`:
- GET /: masked funding accounts, latest 100 batch summaries and adapter catalog.
- GET /eligible: first 500 approved/unallocated active-company/employee requests, no bank accounts.
- POST /funding: bank-profile fields plus reason; creates PENDING_APPROVAL.
- POST /funding/:id/inspect: password + reason; independent pending-account inspection.
- POST /funding/:id/review: password + reason + decision APPROVED/REJECTED.
- POST /funding/:id/retire: password + reason.
- POST /batches: fundingAccountId, paymentDate, distinct requestIds, reason.
- GET /batches/:id: masked immutable funding/beneficiary details and current results.
- POST /batches/:id/inspect: password + reason; full instructions for APPROVED/SUBMITTED batches only.
- POST /batches/:id/approve or /cancel: password + reason.
- POST /batches/:id/submit: password, reason, method MANUAL_BANK_PORTAL, bankReference, evidence (10–1000 chars).
- POST /batches/:id/items/:itemId/result: password, reason, outcome PAID/FAILED, bankReference, evidence.
- POST /batches/:id/report or /draft: authenticated downloads; private/no-store, SHA-256 header; no payment-state change. Draft is FNB Bankserv only and explicitly NOT FOR BANK UPLOAD.
- POST /batches/:id/export: blocked because no verified production adapter is available.

## Verification
API build and Prisma schema validation passed. All 25 Jest suites / 201 tests passed, including 54 new treasury tests for guards/current roles, passwords, independent approvals, masking, eligibility, frozen allocation, duplicate prevention, manual submission, partial results, final-result idempotency, failed-payment holds, cancellation, report safety, DTO validation and removal of simulation. AppModule dependency-resolution test includes the treasury controller.
Targeted strict UI type/syntax checks passed, plus 13 mocked authenticated/no-store HTTP/download contracts including exact approval payloads, filenames, navigation and simulation-button removal. These are targeted checks, not a full Next build or browser E2E. No live database migration, rollback/concurrency execution, banking import or transfer occurred.

## Local acceptance checks before real use
Use a disposable database and two platform administrators. Apply migrations; verify pending/unapproved funding rejection and self-approval rejection. Configure tenant services/subscriptions using existing tools. Create a genuinely approved request with approved bank details. Prepare, attempt duplicate selection from another session, approve independently and verify snapshots after tenant account/name changes. Test cancellation and reallocation before submission. Check current service/company suspension blocks release/submission. Download reports/drafts and confirm no status change. Record a manual TEST bank submission; independently confirm mixed PAID/FAILED results. Verify only confirmed PAID becomes payroll-recoverable, failed allocations remain held, repeated identical results are harmless and conflicting results fail. Check audit entries, window-blur hiding, unauthorized tenant URLs and mobile layouts. Do not use unverified drafts for live payments.

Next: employer Early Pay repayment batches, followed by ordinary/statutory remittances; bank-specific serializer certification and explicit failed-payment recovery remain outstanding.
