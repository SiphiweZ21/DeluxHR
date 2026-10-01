# DeluxHR - COIDA and PSiRA compliance (Batch 15)

This cumulative source package contains the API (DeluxHR/) and UI (deluxhr-web/), including earlier development batches. Keep your existing environment configuration, database and private storage. Do not run a database reset. Back up PostgreSQL and uploaded files before replacing project sources or applying migrations.

## Included

Company Setup > Company & employee documents now includes a Company compliance & document storage card. Its optional evidence categories include COIDA registration, COIDA Letter of Good Standing, COIDA assessment, PSiRA business registration, PSiRA Letter of Good Standing, employee PSiRA registration and PSiRA fee assessment. Existing company document categories continue to work.

Each compliance record captures an authority reference; good standing records require actual certificate issue and expiry dates. PSiRA employee records require a saved employee and officer grade A-E, with API tenant validation and a composite database foreign key. References are normalized to uppercase. Dates must be valid calendar dates, with expiry on or after issue.

Private PDF/PNG/JPEG files up to 10 MB use the existing configurable persistent storage. Download access, audit logs, rejection reasons and independent reviewer controls are retained. The uploader cannot verify their own record. Verification means internal evidence review, not validation against the authority's system. Company activation is not automatically blocked by missing compliance evidence.

Expiry status is calculated on each list request using UTC calendar dates. Expired and next-30-day evidence triggers an on-screen alert. Retained older records may still trigger alerts even if a new certificate exists. No background email or WhatsApp notifications are introduced.

## Employer costs and remittance preparation

Assessment documents require an authority reference, assessment period, ZAR amount (up to R10 million per record) and liability month YYYY-MM. Uploads do not create payable balances. Independent verification includes the assessed amount in the liability register for that month:

| Evidence | Liability code | Creditor name |
| --- | --- | --- |
| COIDA assessment | COIDA_ASSESSMENT | Compensation Fund |
| PSiRA fee assessment | PSIRA_FEES | PSiRA |

These are employer liabilities. They do not deduct employee net pay or alter PAYE/UIF/SDL calculations. Payroll-run employer cost totals remain payroll-run totals; authority assessments are included in the liability register's employer contribution/outstanding totals instead.

The verified reference + assessment period cannot be posted twice for the same company and assessment category, including across liability months. Review a period consistently (for example 2026/2027); free-text period variations still require human scrutiny. Confirm that an assessment is not already represented by a custom payroll ledger entry before verification, to avoid recording the same cost through two sources. Uploaded amounts come from actual authority-issued assessments; no rates, earnings caps or automatic regulatory cost calculations are assumed.

For an organization entitled to payroll, open Remittance Beneficiaries. Create a BANK_TRANSFER beneficiary with the exact liability code and creditor name above, using independently verified authority payment instructions. Follow existing independent beneficiary approval and payment preparation, approval, submission and reconciliation controls. These assessments are excluded from SARS eFiling/UIF declaration groupings. Existing bank-format certification/export blockers remain in force; this batch does not make uncertified bank-import files production-ready. Core HR-only companies can retain evidence but do not gain payroll access.

For corrections after verification, use the existing audited liability adjustment workflow. Verified evidence is immutable. Rejected records stay in the evidence history and do not create balances.

## Install and run

Extract into a separate folder for review first. Copy or preserve your API .env and UI .env.local and retain the same private storage root. The source ZIP excludes secrets and uploaded files.

API terminal, from DeluxHR/:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
npm run build
npm run start:dev
```

UI terminal, from deluxhr-web/ (ensure NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 in .env.local):

```bash
npm ci
npm run test:onboarding
npm run build
npm run dev -- --port 3001
```

The new migration is 20260930190000_compliance_evidence. It adds nullable metadata columns, a composite tenant/employee constraint, assessment validation and duplicate verification protection. Legacy documents are retained.

## Verification and rehearsal

Schema validation and API build passed. API test suite: 29 suites / 322 tests. UI multipart contracts: 17 contracts plus the existing CSV/import checks. Full Next.js production build passed using NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 and system TLS certificates for the existing Google Font fetch. Real PostgreSQL migration execution, concurrent database constraint behavior and browser E2E have not been executed in this environment.

1. Use two company administrators and synthetic documents.
2. Upload a COIDA and PSiRA good standing record with actual test issue/expiry dates. Confirm missing/reversed/invalid dates fail.
3. Upload an employee PSiRA record with grade C. Confirm another company's employee cannot be selected or submitted.
4. Verify/reject as the second administrator; confirm the uploader cannot self-review.
5. Confirm expired/soon-to-expire alerts and private downloads after API restart.
6. Upload a R1,234.56 COIDA assessment for a test assessment period and liability month. Confirm it is absent from the liability register while pending, then appears after independent verification.
7. Verify a duplicate with the same reference and assessment period; expect rejection. Rejected evidence must not create a liability.
8. With payroll enabled, approve the exact beneficiary independently and prepare the assessment payment. Check reserved/outstanding balances, cancellation and reconciliation using the existing payment workflow.
9. Confirm a Core HR-only company has no added payroll access.
10. Back up and restore both database and document storage before real client use.

Official references for manual review: https://www.psira.co.za/index.php/publicity/consumer-awareness and https://cfonline.labour.gov.za/VerifyLOGS/ . No automated authority integration is included.
