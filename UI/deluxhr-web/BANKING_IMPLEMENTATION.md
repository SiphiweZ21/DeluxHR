Latest delivery: Ordinary & statutory remittance preparation — Banking Batch 5 / UI Batch 13. See REMITTANCE_PREPARATION_BATCH5.md. Earlier sections describe historical deliveries.

Latest delivery: Employer Early Pay repayments Batch 4. See EARLY_PAY_REPAYMENTS_BATCH4.md.

Latest delivery: Early Pay treasury Batch 3. See EARLY_PAY_TREASURY_BATCH3.md.

Current cumulative delivery also includes payroll banking Batch 2. See PAYROLL_BANKING_BATCH2.md for the latest behavior and migration. The following records the foundation batch.

# Banking implementation — Batch 1

This cumulative batch adds company funding profiles and payment-purpose defaults. It includes all previous API/UI changes.

## Installation
Preserve your API .env and UI .env.local. Apply both source packages. In the API folder run:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm run start:dev
```

The migration is `20260930120000_company_banking_profiles`: two new enums and two tables, indexes and foreign keys. It does not alter existing payroll/employee tables or seed bank data. Back up the database before applying migrations. In the UI folder run `npm ci && npm run build`, then `npm run dev -- --port 3001`.

## Use
For active companies: Company & Access → Banking & Payments. For pending companies: Company Setup → Company banking & payments. Only current active COMPANY_ADMIN accounts from the same company can access this setup; suspended/rejected companies and platform accounts are excluded by tenant guards. This diagnostic/setup access does not require a payroll feature flag and does not grant payment export rights.

1. Add the company funding account with bank/channel/format choice, account holder, account/branch/type, optional originator identifier, own reference and reason. Keep account numbers as text with leading zeros.
2. The profile starts PENDING_APPROVAL. Sign in as a different COMPANY_ADMIN to review it. Confirm your current password to inspect the full account for comparison with external bank evidence. That read is audited and marked no-store; ordinary responses show only the last four digits. Enter the password again for the approval/rejection decision.
3. Approved profiles are immutable. To change account configuration, submit a replacement, independently approve it, assign its defaults and retire the old one. Retirement removes its defaults in the same transaction.
4. Assign separate defaults for SALARIES, LIABILITIES and EARLY_PAY_REPAYMENT, or clear a default. These are setup selections, not live payment instructions. Changes require a reason and audit.

Approval is an independent administrative review, not an automated bank ownership/CDV verification. Full account numbers are held in the database with the project's existing account-storage approach; transport security, restricted database access and production data-protection controls remain deployment requirements. The UI does not store these values or passwords in localStorage or URLs.

The configuration catalog has 12 options across FNB, Standard Bank, Nedbank, Capitec, Absa and Investec. It distinguishes documented specifications from those still required. All options are NOT_IMPLEMENTED and bankImportReady=false. Neither profile approval nor a selected default activates an export. Existing payroll payment preparation/export remains unchanged and does not yet consume these defaults. Its generic CSV remains a report.

No platform treasury module, actual bank adapter/transfer, new payout/settlement batch or SARS exporter is included yet. No live API or database writes were made during development. Existing go-live readiness has not been made dependent on optional banking profiles.

## Endpoints

- GET /company-banking — scoped masked profiles, purpose defaults and catalog.
- POST /company-banking/profiles — submit immutable pending profile.
- POST /company-banking/profiles/:id/inspect — independent password-confirmed, audited full account read for pending review.
- POST /company-banking/profiles/:id/review — independent password-confirmed approve/reject.
- POST /company-banking/profiles/:id/retire — retire and clear associated defaults.
- PUT /company-banking/defaults — assign approved same-company profile to purpose.
- POST /company-banking/defaults/:purpose/clear — clear purpose default.

All mutation checks and audits run in a transaction. Organization and acting-user row locks hold current tenant/account authorization while mutating. A composite foreign key prevents a default referencing another company's profile. Unknown catalog entries, purposes, full-account scientific notation, self review, incorrect passwords, decided profiles and stale/inactive accounts are rejected.

## Verification
API production build and Prisma schema validation passed. All 20 Jest suites / 118 tests passed. Added banking tests cover masks, role/current-account/status/tenant checks, catalog readiness, submission, independent decisions/passwords, inspection audit, defaults, retirement, DTO validation and audit failure propagation. Targeted strict UI TypeScript/syntax checks, menu cases and seven mocked HTTP contracts passed.

No PostgreSQL instance was available: migration execution and actual transaction/concurrency behavior still need a local disposable-database check. Full Next build, browser E2E and responsive QA remain pending because UI dependencies are unavailable here. Unit transaction mocks do not establish database rollback behavior.

## Manual acceptance checks

- Apply the migration to a backed-up test database; confirm Prisma status is up to date.
- Verify pending and active company setup; reject other roles and direct cross-company requests.
- Create a synthetic account with leading zeros. Verify masked list/API/audit and pending status.
- Reject maker review; reject wrong password without logging out the valid session. Verify separate-checker inspect and decision audit, no-store responses and password field clearing.
- Verify approved configuration cannot be edited and repeated decisions fail.
- Assign each purpose to an approved profile; reject pending/rejected/retired and foreign-company IDs.
- Retire a profile and confirm only its defaults disappear. Test parallel decisions/default changes on a disposable database.
- Check desktop/mobile menu and setup tab; hidden menus for non-company-admin users; no automatic bank export or money movement.

Next: frozen approved payment batches, integration with banking defaults and verified FNB/Standard Bank serializers; platform Early Pay treasury and payout/settlement workflows follow separately.
