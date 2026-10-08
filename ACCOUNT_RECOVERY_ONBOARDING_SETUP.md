# DeluxHR - account recovery and employee onboarding batch

Implemented in source on 8 October 2026. Not deployed to Render. Production email delivery, real accounts, company isolation and onboarding need the live checks below before sign-off.

## What changed

- Login includes Forgot password; public forgot/reset pages are available without a session.
- Reset links expire after 30 minutes. Only SHA-256 token digests are stored. Successful reset consumes all outstanding links for that user, changes the password, increments the session version, clears the five-attempt login lockout and sends a change notification.
- Login failures and recovery request limits use shared database rows, so they survive an API restart and work across service instances. Company and disabled-account restrictions still apply.
- Employee email and EmployeeCode are optional. Blank values are null. EmployeeCode is text, is trimmed, preserves leading zeros and is unique within a company. Different companies can reuse a code.
- Phone remains required. Local South African mobile numbers such as 0844718499 are stored as +27844718499. This validates format, not whether a number is active.
- Employee forms, profiles, import templates, directory search and CSV export include EmployeeCode. CSV email may be omitted or blank. Configure spreadsheet applications to treat employee codes as text when opening a CSV.
- Employees can be added consecutively without approval between records. Onboarding offers Save & add another employee and a searchable pending list. Company employee management supports create/edit, filters, individual or selected batch approval (maximum 100) and per-record approval results.
- Executive Leadership suggestions include Director (DIRECTOR), Chief Executive Officer (CEO) and Managing Director (MD). Suggestions do not create departments or change access automatically.
- Executive and HR roles include employee creation and approval. New Executive role defaults allow executive summaries without detailed payroll/payslip permissions. Existing explicit permission grants are retained; review them on Company Access when applying the new preset.
- Company Access includes department suggestions, individual allow/restrict overrides and a saved effective-access view. Explicit restrictions take precedence over role grants. No additional approval queue is introduced.
- Existing identity completeness, duplicate risks, independent maker-checker checks, tenant boundaries and downstream restrictions on pending employees remain in place.

## Configure Render API environment

| Variable | Value |
| --- | --- |
| AUTH_PUBLIC_APP_URL | https://app.deluxhr.co.za |
| RESEND_API_KEY | Private sending API key from your Resend account |
| AUTH_EMAIL_FROM | DeluxHR <no-reply@deluxhr.co.za>, using a verified sending domain |

Keep the API key on the API service only. It must not be prefixed with NEXT_PUBLIC or committed to source. The email adapter uses the Resend HTTPS email endpoint: https://resend.com/docs/api-reference/emails/send-email . Set up the sending domain before live testing. No credentials are supplied in this package.

The public request response is deliberately generic for unknown, inactive and active accounts. Email is dispatched after the response so provider latency does not disclose whether an account exists. Provider failures are logged without tokens or passwords. If the process stops during dispatch, the message may not arrive; the user can request a new link. Delivery and change-notification failures require operational monitoring; this batch does not add a durable mail queue.

## Deploy safely

1. Back up the live database and keep the previous source release available.
2. Copy the API folder `DeluxHR/DeluxHR` into your existing API project, and `DeluxHR/deluxhr-web` into your existing UI project. Preserve your environment files. The archive uses the same folder layout as the supplied source.
3. Configure the API email variables above. Keep your current DATABASE_URL and JWT_SECRET.
4. In the API project directory, run:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
```

5. Restart/deploy the API only after the migration succeeds. The new code requires the migration. Do not run migrate reset on production.
6. In the UI project directory, retain NEXT_PUBLIC_API_BASE_URL pointing at the production API, then run:

```bash
npm install
npm run build
```

7. Deploy the UI, then execute the live checks below. No live database changes or deployment were performed while preparing this package.

Migration: `20261008100000_account_recovery_employee_onboarding`. It adds nullable employee codes, nullable employee email, reset tokens, session version, permission restrictions and persistent authentication throttling. It does not invent or replace legacy phone numbers, activate employees, grant access to existing users or enable company subscriptions.

Rollback: restore the prior application release if necessary, retaining the additive schema changes. Nullable employee emails may require restoring compatibility in old code; do not delete newly created employee data or reverse the migration blindly.

## Using the employee and access flows

- Company administrators can prepare pending-company employees through Onboarding. Existing pending-company access restrictions are retained; this batch does not allow HR or Executive users to sign into a company that is still pending activation.
- Once a company is active, authorised HR/Executive users use Employees for creation and approval.
- Enter employee names, phone, department and job role. Complete employment and identity details for approval. Email and EmployeeCode can be blank.
- In employee editing, blank email/code clears the value. In the onboarding profile completion form, blank fields keep saved values; use Clear saved email or Clear saved EmployeeCode to remove them explicitly.
- Import employees using the new CSV template. EmployeeCode is distinct from Position code and from the generated EMP employee number.
- A different authorised user reviews profiles and evidence, then approves eligible pending employees. Self-approval is rejected. Existing pending-company independent-administrator checks remain.
- For access setup, choose a department's suggested access preset or assigned role defaults. Review the proposed permissions and save. Detailed payroll and all-payslip access can be granted or restricted separately from executive summaries. Department transfers do not change permissions.

## Validation completed

- API build and UI production build passed.
- API regression suite passed: 38 suites, 377 tests.
- All 68 migrations applied to a fresh isolated PostgreSQL engine (PGlite); nullable email/code, leading-zero codes, company-local uniqueness and cross-company reuse checked.
- Production UI HTTP checks passed for login, forgot-password and reset-password public routes; unauthenticated employee access redirects to login.
- Reset expiry/reuse, hash-only token storage, lockout recovery, session invalidation, delivery failure, permissions restrictions, nullable-email imports, duplicate codes and per-item approvals covered by targeted tests.

These checks do not replace a rehearsal against your Render PostgreSQL database, live provider delivery or real mobile/browser interaction.

## Live acceptance checks

1. Request a reset for an active test login and verify receipt from the configured domain. Compare the public response with unknown and inactive emails.
2. Change the password; sign in with it; verify the old password fails and an old session cannot access a protected API endpoint. Confirm receipt of the change notification.
3. Retry the consumed link and an expired link; both must fail clearly. Verify request throttling and recovery from a five-failure lockout.
4. Confirm inactive users remain inactive and suspended companies remain blocked after recovery.
5. Create two employees consecutively without emails. Assign 000123 as one code; clear/edit it; export and import using the new template.
6. Verify duplicate codes in one company fail and the same code can be used in another company. Confirm blank codes are allowed for multiple employees.
7. Submit local phone 0844718499 and verify +27844718499 is saved. Reject missing phone. Review older missing or non-normalised phones rather than replacing them automatically.
8. Approve eligible employees from an independent Executive or HR user. Include one self-created or incomplete record in a batch and confirm its failure does not prevent other eligible approvals.
9. Apply an individual restriction to employee approval and detailed payroll; verify both menus and direct API requests obey it. Confirm executive summaries still work when the company package enables the dashboard.
10. Attempt access to another company's employee and report data; verify rejection. Review who created and approved employees in audit history.
