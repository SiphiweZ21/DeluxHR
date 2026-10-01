# DeluxHR UI catch-up — Batches 1–14

Source: uploaded `deluxhr-web-source.zip`. This ZIP contains a cumulative Next.js frontend; it includes the reporting, shift, attendance exception and timesheet changes from Batches 1 and 2.

## Delivered

### Batch 1
- Phase 9 workforce report explorer with date filters and CSV downloads.
- CEO dashboard uses `/executive-workforce/overview` for authoritative headcount, cost, attendance, leave, exceptions and movement.
- Navigation, route protection and session cookie lifetime aligned with the Phase 10 API.

### Batch 2
- `/shifts`: create/edit/activate shifts; employee or department assignments; recurring weekday schedules; grace periods; end assignments and schedules. Date end is exclusive, weekdays use Monday=1 through Sunday=7.
- `/attendance-exceptions`: paged status queue, schedule scan, employee explanation display, supervisor resolve/dismiss with reasons. Employee explanations are submitted by the affected employee through their own endpoint/ESS; the supervisor screen does not impersonate that action.
- `/timesheets`: attendance-based timesheet generation, overtime policy, pending approval decisions with reasons, payroll period locking, and a locked status filter. Existing timesheet detail and status controls remain.
- Sidebar and mobile navigation include the two new pages.

### Batch 3 — Leave policies, documents and approvals
- `/leave-policies`: create policies with annual/monthly accrual, entitlement, carry-over/expiry, negative-balance and probation rules, working weekdays, holiday exclusions, supporting documents and medical certificate thresholds; activate/deactivate policies.
- Employee policy assignment with exclusive end dates, assignment history and end/shorten controls; annual balances from the API and opening/credit/debit adjustments with reasons.
- Inclusive date-range leave calendar and company public holiday creation/removal. Calendar charged days explicitly refer to the whole request, not the filtered range.
- `/leave-approvals`: assigned/delegated approval queue, step decisions with required rejection reasons; create/reorder up to five manager/HR approval steps, deactivate workflows, create dated delegations; latest notifications and mark-read controls.
- `/leave-requests`: cancelled status, policy-engine working-day preview for HR, API charged-day totals; configured workflows direct reviewers to their step queue. Requests with no chain retain the existing direct HR decision endpoint.
- `/leave-requests/[id]`: authenticated document upload/download (PDF, PNG, JPEG, 10 MB), ordered approval history and comments, internal HR notes, cancellation/amendment requests, and HR change review with notes.
- Approval queue does not depend on access to company administration endpoints. Assigned approvers can inspect document/history endpoints even when the separate request-summary endpoint rejects them.
- Desktop/mobile navigation and header titles include new leave routes. Entitlement configuration and existing tenant data were intentionally left unchanged.

### Batch 4 — HR Service Desk & Employee Communications
- `/hr-service-desk`: employee request creation and personal list, references, categories, status/priority, response and resolution SLA dates; company HR queue with status, priority, category, assignee and overdue filters.
- Category create/update/deactivate by category code, with response/resolution SLA validation. All-time service report: totals, status/priority/category breakdowns, response/resolution breaches and average resolution hours.
- `/hr-service-desk/[id]`: employee conversation, public attachments and permitted event history. `/hr-service-desk/admin/[id]`: HR assignment, priority, allowed status transitions, escalation with a reason, public comments and internal notes/attachments, full history.
- Status controls match API transitions: OPEN → IN_PROGRESS → RESOLVED; RESOLVED → OPEN or CLOSED; CLOSED has no outgoing transition. Closing is explicitly confirmed. The UI treats closed requests as read-only for new comments/attachments (API still permits attachment upload).
- `/communications`: active linked employee inbox with all/unread filter, pinned/important indicators; administration list and creation with company/department/location/team targeting, local-time scheduling and expiry, pinned/important/acknowledgement flags.
- Communication-team creation and full membership/name replacement (maximum 500 members), employee search, and explicit removal for unavailable/inactive existing members. Active company employees are required by the API.
- `/communications/[id]`: employee announcement detail, authenticated downloads, explicit mark-read and acknowledgement controls. Opening a detail page alone does not claim a read acknowledgement.
- `/communications/admin/[id]`: activation/deactivation, attachment upload/download, recipient read/acknowledgement counters and rows, communication-event history.
- Announcement audiences are recipient snapshots at creation, including scheduled announcements. Later team/location/department changes do not recalculate old recipients. The UI communicates this behavior.
- New routes appear in shared desktop/mobile navigation with matching header titles. API permissions and features remain authoritative; employee/admin requests always use their separate endpoints.

## Batch 4 verification

- Targeted strict TypeScript checks passed using real installed React declarations and temporary Next Link/navigation declarations; changed-file syntax checks passed with zero diagnostics. The checks also included Batch 3 to verify shared-component/API compatibility.
- Mocked HTTP checks passed for personal/admin route separation, internal-note payload restrictions, queue-filter serialization, optional general categories, announcement acknowledgement, authenticated multipart uploads with browser-set content type, unsupported/empty file rejection, propagated feature-denied responses, and client status transitions compared with the API source. No live API calls or writes were made.
- Full Next.js build, lint and browser E2E remain unverified. Frontend dependencies are unavailable: the earlier install failed with network EPERM. Run `npm ci && npm run build` on the Mac.

## Batch 4 manual checks after feature setup

1. Using a linked employee, create a General and a categorized HR request; verify unique references, SLA deadlines, personal detail access, comments and valid attachment downloads.
2. Using HR, filter the company queue and assign/escalate a request; add an internal note and internal attachment, then verify the employee cannot see or download them.
3. Follow permitted status transitions, reopen a resolved request and close it. Confirm invalid transitions are rejected by the API and closed-request UI controls are disabled.
4. Update a category SLA, create a new request and confirm old request deadlines remain unchanged. Check report counts and breach definitions against known requests.
5. Create a company and targeted announcement for active portal employees. Schedule another with a later expiry; verify it appears only after publication and disappears after expiry/deactivation.
6. Open an employee announcement, mark read, acknowledge when required and check the administration recipient counters/history. Test unauthorised recipient and cross-company requests.
7. Create/edit a communication team; verify recipient snapshots on existing announcements do not change. Test valid files and invalid/oversized files in both modules.
8. Use the mobile menu and narrow layouts; confirm all new pages and forms remain usable. Features are still subject to organization entitlement configuration.

### Batch 5 — Payroll Liabilities & Remittances
- `/payroll-liabilities`: month selector and liability register, statutory PAYE/UIF/SDL totals, employee-deduction and employer-contribution summaries, posted-run gross/net/employer-cost figures.
- Liability rows show code/creditor/category/effect, base, signed adjustments, confirmed payments, recorded/unconfirmed payments, outstanding and API status. Search and status/effect filters apply only to visible rows; period summaries/CSV remain whole-period totals.
- External payment recording against an existing code/creditor bucket, unique reference, paid date/time, and exact-cent amount. UI explicitly explains that recording does not transfer funds, and that recorded payments do not reduce outstanding until confirmed.
- Pending payment confirmation or voiding (minimum-eight-character reason to void), with explicit confirmation of the irreversible decision. Confirmed/voided payments show their timestamps/history and no further decision controls.
- Signed liability adjustments with reasons, nonzero/range validation and a check against negative bucket liability. Bucket selection preserves the exact code/creditor pair instead of parsing display labels.
- Reconciliation view shows statutory payroll-field versus ledger differences by run/code, API balanced state, outstanding and recorded/unconfirmed amounts. Empty posted-run periods are clearly identified; a zero total alone is not treated as proof of completed payroll.
- Latest 500 remittance audit events, actor information and reasons; authenticated server CSV download with actual CSV bytes and period filename.
- Decimal rand parsing avoids floating-point rounding, rejects excess decimal precision/exponent/comma input and caps amounts at the API limit of 1,000,000,000 cents. Display uses cents converted to ZAR.
- Period changes remount their view so responses/actions from an earlier month do not replace the new month’s data. Mutation-refresh failures explicitly distinguish saved records from failed refreshes to discourage duplicate submissions.
- Desktop/mobile navigation and header titles include Liabilities & Remittances. API, organization feature settings and tenant data remain unchanged.

## Batch 5 verification

- Changed source syntax checks and targeted strict TypeScript checks passed with zero diagnostics, including Batches 3–4 for shared UI compatibility. Real installed React types were used; temporary Next Link/navigation declarations remain a limitation.
- Mocked HTTP checks passed for period register/reconciliation/history routes, exact code/creditor selection, integer-cent payment and signed-adjustment payloads, confirm/void payloads, authenticated CSV filename/content, and feature-denied errors.
- Money cases include 0.01, 0.29, one-decimal input, leading zeroes, negative adjustment, exactly R10,000,000.00, excess precision, zero, signed payment, exponent syntax, comma/currency symbols and amounts exceeding the API limit. No live API calls or writes were performed.
- Full Next.js build, lint and browser E2E remain pending because frontend dependency installation is blocked by network access. Run `npm ci && npm run build` on the Mac.

## Batch 5 manual verification after feature setup

1. Select a month containing LOCKED/PAYMENT_PROCESSING/PAID runs, compare register statutory totals and buckets with the posted ledger, and confirm other payroll statuses are excluded.
2. Record a payment against a bucket and verify pending increases while outstanding stays unchanged. Confirm it and verify confirmed paid/outstanding update; reload and inspect audit history.
3. Record another payment and void it with a reason; verify it stops contributing to pending. Try to decide a confirmed/voided record again and verify the API rejects it.
4. Apply positive and negative adjustments with reasons, inspect the audit/history, and verify the API rejects zero/negative-total liability adjustments.
5. Check small exact-cent amounts, two-decimal precision and API maximum limits. Verify date/time input uses local time and future payment times are rejected.
6. Run reconciliation against both clean and intentionally discrepant demo ledger data; check each difference and the balanced definition. Check an empty period clearly reports zero runs.
7. Filter liability rows by status/effect/creditor, export CSV, and confirm it contains all period rows, correct ZAR amounts and the expected filename.
8. Switch periods while data is loading, test feature/permission-denied responses, and confirm narrow/mobile layouts and navigation remain usable.

## Applying this cumulative UI package

Apply the companion onboarding checker API fix included with this update. Back up your frontend folder and copy this package over the frontend source, preserving your `.env.local`. Do not copy `node_modules` from another project. Run `npm ci`, `npm run build`, and `npm run dev -- --port 3001` from the frontend folder. The frontend batches need no database migration; the companion API source fixes pending-company independent approval.

## Batch 3 manual verification (after enabling the appropriate organization features)

1. Create a default policy; verify duplicate defaults are rejected by the API. Create a second employee-specific policy and assign it; check overlapping dates are rejected and the exclusive end date is clear.
2. Load an annual balance, record a credit/debit with a reason, reload and compare API totals. Add a public holiday and calculate a leave span that includes it.
3. Configure a manager → HR chain using active users with suitable permissions. Submit leave and verify only the first reviewer sees an actionable step; subsequent steps appear after earlier approval.
4. Upload a valid PDF/PNG/JPEG and download it with the authenticated session. Test unsupported/oversized documents and permission-denied responses.
5. Reject a step with a reason; verify request status and history. Verify workflow requests do not offer direct approval buttons.
6. For approved leave, request cancellation/amendment; review with an HR note and verify request dates/status and balance through the API.
7. Add public and internal comments, verify visibility using employee/approver/HR accounts, test notifications and delegation dates.
8. Use a narrow viewport and confirm all new routes appear in mobile navigation. Confirm refresh/rejected requests retain a clear error and forms remain usable.

## API patch included separately

The original Phase 10 API allowed SELF/TEAM attendance permission holders into company-wide attendance exception and timesheet queues. The companion API patch adds an organization queue guard that denies EMPLOYEE and MANAGER for those controllers until filtered self/team endpoints are implemented. Apply the full companion API source alongside this UI version before exposing the new screens.

## Remaining work

- Employee self-service UI for attendance explanations and safe self/team timesheets, supported by scoped API list endpoints.
- Employee self-service/WhatsApp administration where supported by API endpoints; live onboarding verification before first-customer go-live.
- Permission-aware menu visibility and broader role-specific routes; live E2E tests and responsive QA.

## Verification

Batch 3 changed files passed TypeScript syntax checks and a targeted strict check using the installed React declarations and temporary Next Link/navigation declarations (zero diagnostics). This is not a full Next.js build. Dependency installation failed with network EPERM fetching `zod-validation-error`; a complete project type check and browser E2E could not run. No live API writes were performed.


Changed frontend files passed TypeScript syntax transpilation. Full Next.js build was not possible: the package registry request timed out and a package tarball was absent from the local cache. Run `npm ci && npm run build` on the Mac. API: `npm run build`, 16 Jest suites and 51 tests passed. Live database and browser E2E remain pending.

## API/UI limitations retained

- Feature entitlements remain enforced by the API. The current organization may still display “This feature is not enabled for your organization”; no access checks were bypassed.
- Company-wide leave request listing returns at most 200 rows; approval queue scans at most 200 candidate steps, notifications at most 100. These are API limits with no cursor contract, so the UI does not invent pagination.
- The API provides delegation creation but no delegation-list/revoke routes, and policy create/activate/deactivate but no policy-edit route. The UI exposes the supported operations.
- HR action visibility currently uses COMPANY_ADMIN/HR_ADMIN role hints; API permissions still decide authorization. Custom permission-aware UI visibility remains a later catch-up item.
- Direct decisions on legacy requests have no rejection-comment field in their API DTO. For a documented reason, add a request comment before using that legacy endpoint, or configure approval chains for new requests.

## Batch 4 API limits retained

- Personal HR requests return at most 100 rows; the HR queue at most 200 oldest matching rows. No cursor/pagination route exists. Reports are all-time, with no date-range or export DTO.
- Employee announcement inbox and administration history return at most 200 rows. Announcement edit/delete, recipient retargeting and a draft state have no API routes, so the UI exposes creation, scheduling, activation and supported tracking operations.
- HR request creation requires a linked employee account; announcement inbox requires an ACTIVE linked employee. Admin users without that link can still use administration tabs when permitted.
- Company-user lookup for assignment/escalation and category administration needs existing API permissions. Optional name lookups do not block personal-detail or announcement-receipt endpoints; IDs appear when names are unavailable.
- Department/location/team options load independently. A failure is displayed without preventing company-wide announcement creation. Location lookup also requires the existing ATTENDANCE feature and VIEW_ATTENDANCE permission.

## Batch 5 API definitions retained

- Register period membership uses payroll `payPeriodEnd` within the UTC calendar month and posted run states LOCKED, PAYMENT_PROCESSING or PAID. Mixed/non-ZAR payroll is rejected by the API; this UI does not invent conversion rates.
- Register uses supported deduction/employer ledger entries and excludes EARLY_PAY_RECOVERY. An adjustment/payment can only target an existing locked-ledger code/creditor bucket.
- Outstanding is base plus adjustments minus CONFIRMED payments. RECORDED payments contribute to pending; VOIDED payments contribute to neither. Overpayments are allowed and flagged OVERPAID.
- Reconciliation balanced state requires no statutory ledger differences and zero outstanding for every bucket. Net zero across positive/negative buckets is insufficient; pending records are reported separately.
- Payment decisions apply only to RECORDED records. No editing/reversal endpoints exist for confirmed or voided payments, and adjustments have no delete endpoint.
- Read/export routes need VIEW_PAYROLL; adjustments/payments/decisions need MANAGE_PAYROLL. The API remains authoritative for access. CSV export is audited server-side; refresh Audit history to see the event.

## Batch 6 — Platform Administration UI

- Separate `/platform-admin` workspace with desktop/mobile navigation and verified `/auth/me` access. Only active PLATFORM_ADMIN/SUPER_ADMIN accounts without a company association may enter. Platform logins route to this workspace.
- Overview includes platform usage and database/process health; company list supports search, status filtering and pending company creation with an initial administrator.
- Company detail includes profile/usage, permitted status transitions, activation readiness and onboarding progress, company accounts and latest 200 audit events.
- Packages support creation and editing only before subscription, required Core HR and payroll feature dependencies, active state and employee limits. Existing subscribed packages require a new code.
- Subscription assignment explicitly confirms replacement of all company feature flags. Feature controls show configured flags separately from effective access, retaining subscription gates and core/payroll dependencies.
- Super-admin-only account creation/status controls and configuration editing. API protects self, super-admin targets and the final active company administrator.
- Support sessions create, preview and revoke limited read-only company access with reasons and expiry. No identity/token switching is implemented; previews reject mismatched company IDs. Session IDs are retained only in component state.
- Configuration exposes stored support duration, registration and maintenance banner settings. Enforcement/display of registration and banner values outside this screen has not been verified.
- No API changes, migrations, live API writes or tenant entitlement/data changes were performed. These controls are available for deliberate future administrator actions.

## Batch 6 verification

Targeted strict TypeScript checks for Batches 3–6 and changed-source syntax checks passed with zero diagnostics, using real React declarations and temporary Next Link/navigation declarations. Mocked HTTP checks passed for company scopes, status changes, feature/subscription payloads, support session creation/preview/revocation, configuration, authorization headers and rejected access; role-home routing and package dependencies also passed. Full Next build, lint and browser E2E remain pending because dependency installation is blocked by network access.

Manual verification on the Mac:
1. Sign in with platform and company accounts; verify workspace routing and company-account denial of platform routes. Check mobile navigation.
2. Create a pending demo company and inspect readiness. Verify activation is rejected until requirements are satisfied; test suspension/reactivation and terminal rejection only on disposable demo companies.
3. Create a package, assign its subscription, inspect configured/effective features, pause/cancel/reactivate and test expiry. Verify subscribed packages cannot be edited and dependencies cannot be broken.
4. Compare PLATFORM_ADMIN and SUPER_ADMIN account/configuration controls. Test protected self/super-admin/last-company-admin operations against the API.
5. Create a support session, preview, verify the platform identity remains unchanged, revoke and test expired/revoked sessions. Inspect audit records.
6. Verify usage counts and health labels against the API; health is a database/process check, not a comprehensive service monitor.

Next batch: expanded Customer & Company Onboarding UI.

## Batch 7 — Customer & Company Onboarding UI

- `/onboarding` now provides a company-admin setup workspace: live readiness, required/optional checklist, counts, progress, company/profile/registration/brand colour, authenticated logo upload/view, additional company administrators, departments, locations and shifts.
- Leave setup includes leave types, default/employee-specific policies, weekday/accrual/carry-over/probation/document rules, exclusive-end policy assignments and public holidays.
- Employee CSV import includes a header-only template, preview, BOM/quoted commas/escaped quotes/embedded-newline parsing, reordered headers, required fields/email/UUID/duplicate checks, 1–1000 rows, server errors and created IDs. Imports create PENDING_VERIFICATION employees. Profile completion and eligible activation controls use the dedicated setup endpoints.
- Opening leave records explicitly create additive OPENING adjustments, with confirmation; zero balances need no adjustment. Public holiday/opening leave/opening payroll reviews use separate API confirmation endpoints, with optional review notes.
- Payroll setup includes frequency, UIF/SDL and approval settings, employee salary/rate/tax/pay-frequency profiles, pending bank-detail submission and password-confirmed independent approval. Bank response details remain masked; sensitive form inputs are cleared after submission attempts.
- Login honors `onboardingOnly`. Root routing checks company-admin status through `/auth/me` before rendering company routes; pending administrators are directed to a focused setup screen. Activation remains a platform-admin action in Batch 6. No self-activation, impersonation or automatic feature changes were introduced.
- Existing onboarding-mode/assistance UI is retained at `/onboarding/preferences` for active-company accounts under the existing permission/entitlement rules.
- Record choices returned during setup remain in component memory across tabs. Existing lists load independently for active companies only; failures do not block setup. Pending companies can enter known IDs because the API provides no pending-safe department/employee/leave-policy list or profile read endpoint. Saving the profile returns its updated fields. This is a supported-API limitation, not invented access.
- Corrected the prior Batch 6 `@/*` TypeScript alias to `./src/*`, matching the platform page imports. This cumulative package includes that correction.
- The accompanying API onboarding checker fix is now required for the revised verification flow. No migrations, live API writes, tenant data repairs or entitlement changes were performed.

## Pending-company independent approval — fixed

- During dedicated pending-company onboarding, a second active COMPANY_ADMIN in the same company may activate employees or approve bank submissions created by another active COMPANY_ADMIN. Self approval remains prohibited.
- Bank approval still verifies the checker’s current password. Both accounts and the organization are checked from current database state; organization/account locks hold the pending exception stable until the approval commits. Audit metadata records the independent onboarding approval.
- The exception is enabled only by the onboarding controller; ordinary employee/bank endpoints and active-company checker roles remain unchanged. It stops applying when the organization is ACTIVE, SUSPENDED or REJECTED. No new platform impersonation or pending HR/PAYROLL login access is added.
- Create the second administrator in Company & administrators. Sign out, sign in as that checker and use the employee/payment-detail IDs returned by the maker’s setup actions. Pending-safe list routes remain unavailable, so those IDs are needed across sessions.
- Package, profile, branding, employee completeness, duplicate-identity risk, salary/rate coverage, approved bank coverage and opening review checks still gate company activation. Review confirmations must follow the latest employee import.

## Batch 7 verification

- Changed-source syntax checks and targeted strict TypeScript checks covering Batches 3–7 passed with zero diagnostics. The check now reads the actual project import alias; real React declarations and temporary Next Link/navigation declarations were used.
- Mocked HTTP checks passed for all dedicated onboarding setup mutations, employee import/update/activation, fixed administrator role, fixed OPENING adjustment type, review confirmations, payroll profiles, payment submission/approval and authentication headers/denied errors.
- CSV cases passed for BOM, CRLF, reordered headers, quoted commas, escaped quotes, embedded newlines, phone leading zeroes, duplicate case-normalized emails, malformed quotes/field counts, invalid UUID/email, empty import, exactly 1,000 rows and rejection of 1,001 rows.
- Logo checks passed for authenticated multipart upload with no JSON Content-Type, authenticated blob reads and rejection of empty/unsupported/oversized files. Mocked platform contracts were rerun and passed for compatibility.
- No live API calls or writes were made. Full Next build, lint, browser E2E and responsive QA remain pending because frontend dependencies are unavailable and previous installation attempts were blocked by network access. On the Mac run `npm ci && npm run build`, then `npm run dev -- --port 3001`.

## Batch 7 manual verification

1. Create a pending company in the platform workspace, assign an active package, sign in as its company administrator and verify direct setup routing. Verify pending navigation to other company pages returns to onboarding. Active-company and platform routing must still work.
2. Complete profile, registration, address and colour; upload/view a PNG/JPEG logo. Check rejection of unsupported/oversized files. Refresh readiness and compare individual checklist items with the API.
3. Create departments, locations, overnight/day shifts, leave types/default policies and holidays. Retain returned IDs. Verify policy assignment overlaps and invalid dates are rejected. Check narrow layouts and all setup tabs.
4. Download the CSV template, import a valid demo file, inspect created IDs/status, complete employee profiles and test duplicate email/invalid department/employee-limit errors. Confirm imported rows do not appear active. Verify self-approval is rejected and a different active same-company administrator can verify employees while the company is pending.
5. Record a reviewed opening leave adjustment once; verify it is additive. Confirm public holidays/opening leave only after review. Import another employee and verify opening readiness becomes incomplete until reviewed again.
6. Save payroll settings and employee salary/rate profiles; submit bank details and inspect masked responses/IDs. Test same-maker and wrong-role rejection and wrong-password handling. Verify fields clear without persisting bank numbers or passwords.
7. Confirm opening payroll after review; verify positive-profile and approved-bank-detail checks still enforce requirements independently of the confirmation. Do not interpret confirmation alone as go-live readiness.
8. With the companion API fix applied, complete independent verification using the second administrator, refresh the readiness gate, activate through the platform workspace and verify ordinary company access. Verify the pending company-admin exception is denied after activation.

Remaining catch-up: employee self-service/WhatsApp UI where the API supports it, full build/browser QA.

## Onboarding checker fix verification

- API production build passed. All 17 Jest suites / 77 tests passed, including 26 added independent-checker cases covering same-user, inactive, cross-company, missing-account, platform/wrong-role, stale role, non-pending company, incomplete employee, duplicate risk, stale transition, wrong password and already-decided bank versions.
- API approval writes and audit now share their transaction. Existing readiness tests continue to reject incomplete profiles/bank coverage and platform activation when requirements are missing.
- Updated frontend source passed syntax and targeted strict TypeScript checks; mocked onboarding request contracts remain passing. Full frontend build/browser QA and live database concurrency/E2E checks remain pending.
- Apply both API and UI ZIPs, preserve your environment files, rebuild/restart the API, and test the two-administrator flow with disposable demo data. No schema change or new migration is required. At that delivery, feature-entitlement data remained deferred; Batch 8 adds audited service controls without making automatic data changes.

## Batch 8 — Service access and grouped navigation

- Added an authenticated workspace access snapshot and audited company service controls. Effective access accounts for subscription availability, configured feature flags and current permission scopes. Active legacy companies can restore Core HR; paid features require an active package that includes them. Payroll dependencies are enforced. No automatic tenant changes were made.
- Added Company & Access → Services, accessible when feature flags are missing. Six shared desktop/mobile navigation groups use collapsible sections, search and access filtering. Known direct routes are gated before page requests; dashboard module requests also respect access.
- Hardened Earnings and Early Pay API permissions. Personal Early Pay access checks the active same-company employee linked to the current user.
- API build and all 19 suites / 91 tests passed. Targeted strict UI type/syntax checks and menu access cases passed. Full Next build and browser QA remain pending.
- Apply both packages and restart. No migration is required. Use Services to restore allowed flags; missing/expired subscriptions require a platform administrator. See SERVICE_ACCESS_AND_PAYMENTS.md for the four separate payment streams and current bank adapter limitations.

Manual checks: test a company with missing Core HR, an active package, an expired subscription and an excluded service; verify dependencies and audit reasons. Compare administrator, payroll, HR and employee menus; check direct denied routes, accordion/search on mobile and desktop, and refresh after service changes. Confirm payroll/Early Pay direct API permissions independently of menu visibility.

## Batch 9 — Company banking profiles

- Added Company & Access → Banking & Payments and a pending-safe Company Setup tab. Company administrators can submit funding accounts, independently inspect/review them with password confirmation, retire immutable profiles and assign salary/liability/Early Pay repayment defaults. Account lists and audits are masked; full inspection is audited with no-store responses.
- Added 12 configuration catalog entries across six banks. All bank exporters remain unavailable; documented specifications are distinguished from missing specifications. Profile approval does not imply bank-format verification. Existing payroll exports do not yet consume defaults.
- Companion API includes `20260930120000_company_banking_profiles`; deploy this migration and regenerate Prisma before rebuilding. No existing payroll table or data is changed by it.
- API build/schema validation and 20 suites / 118 tests passed. Targeted strict UI type/syntax, menu cases and seven mocked HTTP contracts passed. Live migration/concurrency tests and full Next/browser QA remain pending.
- See BANKING_IMPLEMENTATION.md in both archives for setup, limits and manual checks. Platform treasury, verified serializers, real payout/repayment batches and statutory configuration remain next work.

## Batch 10 — Payroll payment batches and frozen exports

- Added Payroll & Payments → Payment Batches with locked-cycle and approved-funding selectors, independent release approval, masked frozen beneficiary details, generic report download and FNB Bankserv draft validation/download.
- Registered the existing payroll cycle/payment modules and restricted their API permission checks to ORGANIZATION scope. Preparation snapshots the selected/default funding account, date and employee identity/reference.
- Generic reports and bank drafts do not advance payment status. Production export stores immutable bytes/checksum and blocks all current unverified adapters. The FNB draft is explicitly NOT FOR BANK UPLOAD; its specification length ambiguity and bank testing remain unresolved.
- Apply the companion nullable-column migration `20260930140000_payroll_payment_freeze`, regenerate Prisma and rebuild/restart. API build/schema validation and 24 suites / 147 tests passed. Targeted strict UI/menu and nine mocked payment HTTP/download contracts passed. Live migration/concurrency and full Next/browser checks remain pending.
- See PAYROLL_BANKING_BATCH2.md in both packages for current capabilities, legacy-batch behavior, install instructions and manual checks.

## Batch 11 — Early Pay treasury

Added Platform Administration → Early Pay treasury with platform funding-account approval, payout selection/preparation, independent release, masked frozen instructions, authenticated report/test-draft downloads, manual bank submission recording and independent per-item bank-result confirmation. Tenant simulated payment action was removed; older API clients get an explicit rejection. Confirmed failures stay allocated and PAYMENT_FAILED; retries/corrections need a later workflow. Historical SIM- records are preserved and labelled.

Apply API migration `20260930150000_early_pay_treasury`, regenerate Prisma and rebuild both projects. API build/schema checks and 25 suites / 201 tests passed; targeted strict UI and 13 mocked treasury HTTP/download checks passed. Live database/migration and full Next/browser checks remain pending. Production bank file exports remain blocked. See EARLY_PAY_TREASURY_BATCH3.md in both packages.

## Batch 12 — Employer Early Pay repayments

Added Payroll & Payments → Early Pay Repayments and Platform Administration → Employer repayments. Includes paid-ledger/confirmed-payout eligibility, separate frozen company repayment batches, independent release, masked reports/FNB test drafts, manual submission recording and independent partial/final incoming receipt confirmation. Company RECOVERED and DeluxHR REPAID remain separate. Payroll recovery marking now uses exact ledger source IDs atomically.

Apply API migration `20260930160000_early_pay_repayments`, regenerate Prisma and rebuild both projects. API build/schema checks and 26 suites / 256 tests passed; targeted strict UI plus 13 HTTP/download contracts passed. Live migration/concurrency and full Next/browser checks remain pending. No production bank export is yet enabled. See EARLY_PAY_REPAYMENTS_BATCH4.md in both packages for setup, permissions and acceptance checks.

## Batch 13 — Ordinary & statutory remittance preparation

Added Payroll & Payments → Remittance Preparation and Company & Access → Remittance Beneficiaries, plus expandable beneficiary/statutory routing configuration in the onboarding/company banking tab. Ordinary creditor accounts and verified statutory portal routes require independent company-admin approval. Preparation freezes approved funding, destination, period/date/reference and allocations, reserves amounts, supports independent release and records externally authorized payment submission. Independent bank results create linked confirmed liability accounting only for full paid amounts; failed/mismatched results remain held for investigation. SARS uses official EMP201 PRNs and reconciled declared amounts; SARS-registered UIF routes through SARS, with direct UIF only under verified appropriate registration.

The existing liability register now displays reserved/available balances, blocks overpayment and reuse of reserved funds, protects liability reductions, and requires independent confirm/void with substantive reasons. New and adjusted menu/actions respect feature and organization-scoped permission grants. Early Pay repayments remain separate. Preparation CSV reports and eligible FNB test drafts do not send money or mark paid; statutory drafts and all production bank export remain unavailable.

Apply migration `20260930170000_remittance_payment_preparation`, regenerate Prisma and rebuild the API and UI. Prisma validation/API build and 27 suites / 290 tests passed; targeted strict UI checks and 15 HTTP/download contracts passed. Run `npm run test:remittances` after UI dependency installation. Full Next/browser/mobile, live PostgreSQL migration/rollback/concurrency and bank acceptance remain pending. See REMITTANCE_PREPARATION_BATCH5.md in both cumulative packages for setup, precise routes, evidence rules and acceptance checks.

## Batch 14 — Positions, onboarding polish & private documents

Company Setup now includes department-linked positions and retirement, one-employee creation with selected position, rich name/code-based CSV import, profile review with masked identity, and server-backed department/position/employee/leave choices during PENDING and ACTIVE setup. Records load after refresh and another administrator's sign-in; named selectors replace manual ID entry for related setup. Legacy job-title-only employees/minimal CSVs remain supported. Position/company/department links are enforced by the API and composite database foreign key.

The new Company & employee documents tab provides private PDF/PNG/JPEG uploads and audited authenticated downloads for company registration/tax/address evidence and existing employee-document categories. Independent verification/rejection prevents uploader self-approval. File storage supports a configurable persistent private root; existing file paths remain the default, and archives do not include stored bytes. Backup/restore must include the database and file store. S3/cloud object storage, antivirus scanning and automated retention/backup policies remain follow-up work.

Apply API migration `20260930180000_positions_onboarding`, generate Prisma and build both projects. Schema/API build and 28 suites / 311 tests passed; targeted strict UI and 15 onboarding HTTP/document/CSV contracts passed. Run `npm run test:onboarding` after UI dependencies are installed. Full Next/browser, live migration/concurrency, backup restore and company activation remain unverified. See ONBOARDING_POSITIONS_DOCUMENTS_BATCH14.md and onboarding-rehearsal/sample-employees.csv in both cumulative packages for the local first-company rehearsal. No real client data or production company was created.
