# DeluxHR - Required company profile fields (Batch 17)

This cumulative API/UI package includes previous compliance and WhatsApp attendance changes, the pending administrator identity fix, the corrected migration ordering and the profile UX fix.

Mandatory company profile fields now have an asterisk and native HTML required validation: company name, legal name, registration number, contact email/phone, street address, city, province, postal code, country and timezone. Whitespace-only mandatory fields fail before submission with a list of missing field labels. Tax number is mandatory only when the API's current readiness rules require payroll settings. Website, address line 2 and brand colour remain optional. A company logo is separately required for activation and is now labelled accordingly.

The profile form saves a complete set of mandatory profile fields. The existing PATCH API remains a partial-update API and readiness remains the authoritative activation gate. Optional blanks are omitted, preserving stored optional values.

GET /customer-onboarding/profile now provides saved profile fields and payrollRequired to pending/active company administrators using the existing tenant guard and pending onboarding allowance. It returns only profile fields, not internal storage keys. No-store caching is used. Saved values populate the form; absent country/timezone values default to South Africa and Africa/Johannesburg. Loading failures show an error and retry instead of an empty form.

The /auth/me identity fix allows COMPANY_ADMIN accounts in PENDING companies to enter Company Setup. Other pending company roles and suspended/rejected companies remain blocked. Normal tenant routes still require ACTIVE companies.

## Installation for the current rehearsal

Stop API/UI first. Extract this ZIP into a new review folder or update your existing project sources carefully. Preserve .env, .env.local and all private uploaded file storage. Do not copy the ZIP over your environment files, reset the database or seed demo data.

Your current rehearsal has already applied positions at 20260930180000 and compliance at 20260930190000 through the repair script. This package contains those corrected migration directories. Do not restore the old 20260930173000_compliance_evidence directory from an older ZIP. No new database migration is introduced in Batch 17.

If using a different database that successfully applied the original 173000 compliance migration, reconcile its migration history before deploying this corrected package. The fresh-rehearsal repair is not intended for already-applied original migration histories.

API, from the updated DeluxHR folder:

```bash
npm install
npx prisma generate
npm run build
npm run start:dev
```

UI, from the updated deluxhr-web folder, keeping NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 in .env.local:

```bash
npm install
npm run build
npm run dev -- --port 3001
```

Both API and UI must be updated for the saved-profile endpoint. Sign out/in if access is stale, then open Company Setup > Company & administrators.

## Validation

API and full Next.js production builds passed. Full API suite before the two new profile tests: 31 suites / 352 tests; the two new profile tests also passed. They check saved-profile loading, tenant organization ID usage, payroll-required true/false and private-field omission. UI HTTP contracts: 19 checks plus existing CSV checks. Live browser validation against your local rehearsal remains outstanding.

Rehearse: load saved pending profile; confirm mandatory labels and defaults; submit empty mandatory fields and whitespace-only values; save complete mandatory values; reload and confirm persistence; leave optional fields blank; switch to a payroll-enabled package and reload to confirm tax number is required. Refresh readiness after saving and upload the required company logo separately.
