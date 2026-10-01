# DeluxHR — Pending-company onboarding checker fix

The pending onboarding workflow now permits a second active COMPANY_ADMIN in the same organization to verify employee imports and bank submissions made by another active COMPANY_ADMIN. This fixes the role deadlock without allowing creators to approve their own records.

## Scope

- The exception is trusted controller context, not a request DTO flag. Only the dedicated customer-onboarding activation/approval routes enable it.
- The organization must be PENDING; both current database users must be different, active COMPANY_ADMIN accounts belonging to that organization. Organization and account row locks stabilize these conditions during the approval transaction.
- Employee activation still validates complete profiles, employment dates, duplicate identity risks and current employee state. Bank approval still validates pending status and the checker password, supersedes prior approval atomically and returns masked bank data.
- Audit writes share the approval transaction and include onboardingIndependentAdmin metadata. Normal active-company role rules, self-approval denial, tenant isolation and platform-account restrictions remain in place.
- No database/schema migration, entitlement repair, tenant data change or live API write was performed.

## Apply

This is cumulative API source based on the Phase 10 workforce-scope package, plus the matching cumulative frontend with updated onboarding guidance. Back up both project folders, copy the source over your existing projects while preserving .env/.env.local and local dependencies. In the API folder run npm run build, then restart npm run start:dev. In the UI folder run npm ci and npm run build, then npm run dev -- --port 3001. No prisma migrate command is needed for this fix.

## Manual go-live verification

1. In a disposable PENDING company with an active package, sign in as its first company administrator (maker).
2. In Company & administrators, create the independent second administrator. Complete company/branding/department/leave/location/shift/payroll setup as required by the package.
3. Import employees, retain IDs and complete profiles. Enter salary/rate profiles, submit bank details and retain payment-detail IDs. Verify the maker cannot activate or approve their own records.
4. Sign out, then sign in as the second company administrator. Use the known employee IDs to activate records. Use employee/payment-detail IDs and the checker’s own password to approve bank details. Wrong passwords must reject without changing prior approved versions.
5. Review opening leave/payroll and confirm after the latest import; refresh readiness and check positive payroll profile and approved-bank coverage for every active employee.
6. As a platform administrator, review readiness and activate the company. Verify ordinary tenant access now works, and the pending-company COMPANY_ADMIN exception is denied after activation. Normal HR/PAYROLL checker roles remain required for company-admin-created operational records.
7. Inspect employee and bank approval audit records for maker/checker identifiers and onboardingIndependentAdmin. Test another company, inactive user and self-approval rejection. Live database concurrency behavior should also be exercised before release.

## Validation

API npm run build passed. All 17 Jest suites / 77 tests passed, including 26 new checker-flow regression cases. Updated UI syntax/targeted strict TypeScript and mocked HTTP contracts passed. Full Next build/browser E2E and live database concurrency checks remain pending; frontend dependency installation is blocked in this environment.
