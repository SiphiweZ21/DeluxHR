# Positions, onboarding lookups & private documents — UI Batch 14

This cumulative API/UI delivery adds department-linked positions, richer employee creation/import, persistent server-backed setup lookup lists, profile review and private company/employee document workflows. It preserves the earlier payroll, banking and remittance work. It does not create a real customer or claim that production onboarding has passed.

## Install

Preserve API `.env`, UI `.env.local` and the existing `storage/` directory. Back up PostgreSQL AND file storage before source replacement. ZIPs contain source, not stored documents or a database backup.

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
npm run test:onboarding
npm run build
npm run dev -- --port 3001
```

The new migration is `20260930180000_positions_onboarding`. It creates Position and CompanyOnboardingDocument, adds nullable Employee.positionId, adds a department/company composite key and enforces that a selected position belongs to the employee's company AND department. Positions and company documents use restrictive history deletion. SQL checks enforce nonblank position names/codes and company-document type, size, review status and independent reviewer. Existing employee job titles remain intact; there is no automatic position assignment, data deletion, subscription change or feature enablement.

## Positions and employees

In Company Setup → Departments, locations & shifts, create a department and its positions. Position codes are normalized to uppercase and names/codes are unique within the department. Position names and departments are immutable in this delivery; retire a position and create a replacement rather than rewriting history. Retired positions remain visible in saved lookup lists and retain existing employee links, but new assignments and activation of pending employees in retired positions are rejected.

Company Setup → Employee import & verification provides:
- Add one employee with selected department and active position, employment information and identity fields.
- Improved CSV import by departmentName + positionCode, with automatic resolution to saved same-company IDs. The original departmentId template remains supported; positionId is also supported.
- Complete/update employee profiles with department and position selectors. Changing department for an assigned employee requires a valid position in the destination department. Job title is derived from the selected position; a conflicting title is rejected.
- Saved employee profile review, including employment dates and masked identity numbers, for the second administrator.
- Independent employee activation using the established pending-company second-administrator rule. Existing normal checker roles remain authoritative after activation.

CSV template columns:
`firstName,lastName,email,phoneNumber,departmentName,positionCode,employmentType,employmentStartDate,employmentEndDate,identityType,identityNumber,whatsappNumber`

Optional blank columns are omitted from the API payload. Employment types and identity types are validated by the API enums; dates must be valid ISO dates, and end cannot precede start. The full rich template allows profiles to be complete on import. Legacy minimal imports still create pending employees who need profile completion. Imports remain all-or-nothing, with a 1000-row / 5 MB UI limit. Duplicate emails, invalid department references and duplicate identities are rejected; position membership/activity and rich fields are checked in the creation transaction. Identity duplicates are rechecked under the existing company employee-creation lock. No import automatically activates employees.

Names are resolved case-insensitively; ambiguous department names or missing/retired position codes fail before submission. The server still validates the resolved IDs, so stale or manipulated client lookups cannot assign a foreign position. Employee identity numbers remain masked in general profile responses; full supporting evidence is available through audited private document downloads.

## Saved onboarding lookups

`GET /customer-onboarding/lookups` supplies company-scoped departments, positions, employees, leave types and leave policies for COMPANY_ADMIN. It works for PENDING onboarding and ACTIVE companies, independent of ordinary module-list access. It deliberately provides setup choices, not operational access to disabled services.

The UI loads these records when opening setup and after saves/readiness refreshes. Named selectors replace manual UUID inputs for related setup. Records survive page reload and a second administrator's sign-in because they are queried from the database; no employee/identity/document data is stored in browser localStorage by this change. Lists currently load all company records and are intended for SME onboarding; large tenants will need paginated searchable selectors. Location/shift creations still have their existing session summary; persistent lookup work here covers the main related setup fields above.

## Documents

Company Setup → Company & employee documents adds:
- Company registration, tax registration, address proof and other company documents.
- Employee identity, employment contracts, banking proof, tax, qualification and other supported employee document categories using the existing employee-document service.
- PDF, PNG and JPEG uploads, maximum 10 MB, with server MIME/signature checks and authenticated no-store attachment downloads.
- Pending verification, independent verify/reject and retained metadata/audit history. Company reviews require a reason. Employee document reviews now reject the uploader across the normal document API too, so the legacy route cannot bypass independent review.
- Company-admin-only onboarding routes and organization-scoped permissions on ordinary employee-document controllers. IDs from other companies are rejected before bytes are accessed. Storage keys are removed from list/upload responses.

Documents do not prove that a government registration has been externally validated. Banking proof upload does not approve employee bank payment details. Documents are available for manual readiness review but are not a new mandatory automated company-activation gate; the existing readiness checklist and subscribed-service requirements remain unchanged. Legacy job-title-only employees remain supported.

### Durable private storage

The backend still uses private filesystem storage. It is configurable for a persistent volume; this is not an S3/object-storage adapter.

Optional API `.env` settings:

```dotenv
DELUXHR_STORAGE_ROOT=/absolute/path/to/private-persistent-deluxhr-storage
# Optional override for the employee/company document store only:
# EMPLOYEE_DOCUMENT_STORAGE_ROOT=/absolute/path/to/private-document-store
```

With no changes, existing paths remain under the API project's `storage/` directory. DELUXHR_STORAGE_ROOT controls employee/company documents, company logos, leave documents, HR service-desk attachments and announcements. The optional employee override takes precedence for employee and company documents. Company documents use a separate `_company` directory within the private document store. Random internal filenames are used; new employee/company document directories/files use modes 0700/0600. Upload failures clean up newly written document bytes when the metadata transaction fails. Download operations are audited.

If changing a storage root, stop the API, copy the existing storage contents with their relative paths into the new root, preserve permissions, then set the variable and restart. Do not point to an empty root and expect existing metadata to find its files. Do not expose this directory via a public/static web route. On a container or hosted deployment, mount a durable private volume shared by the API instances that serve files. Ephemeral disks are unsuitable. Back up BOTH the database and matching file store; rehearse a restore and successful authenticated document downloads before the real client. File-system paths are administrator configuration, not client-facing links.

File-signature checks are not antivirus scanning or a guarantee that PDF contents are harmless. Cloud object storage, malware scanning, retention/legal-hold policy and automated backup/restore scheduling remain production follow-ups. New document storage has been tested across service restart, not across a production hosting redeployment.

## API additions

Authenticated `/customer-onboarding`, pending-company onboarding allowed; service/controller requires COMPANY_ADMIN:
- GET /lookups: saved company choices.
- POST /positions: departmentId, name, code.
- POST /positions/:id/retire: retire without deleting history.
- POST /employees: enriched CreateEmployeeDto; existing bulk endpoint accepts the same enriched rows.
- GET /employees/:id: safe employee profile with masked identity.
- GET/POST /employees/:id/documents: list/upload existing employee document categories.
- GET /employees/:id/documents/checklist: existing per-employee checklist.
- GET /employees/:id/documents/:documentId/file: audited private download.
- POST /employees/:id/documents/:documentId/verify or /reject: independent review; rejection reason required.
- GET/POST /documents: company-document list/upload.
- GET /documents/:id/file: audited private download.
- POST /documents/:id/decision: VERIFIED/REJECTED plus reason; independent pending review.

## First-company rehearsal

Use a disposable/local test database and synthetic information. Do not use real client identity documents for this rehearsal. The included `onboarding-rehearsal/sample-employees.csv` contains fictional records with identity type OTHER.

1. Install both packages, apply migrations, generate Prisma, build both projects and run UI/API on 3001/3000. Check Prisma migration status.
2. In Platform Administration create **DeluxHR Onboarding Rehearsal** and its first company administrator. Assign an ACTIVE package containing CORE_HR only for this initial scope. Choose passwords yourself; no shared default credentials are supplied.
3. Sign in as the company administrator and open Company Setup. Complete all required company profile/address/registration fields and upload a valid logo. Use synthetic registration/contact information.
4. Create a second active company administrator. Sign in as that checker in a separate browser profile later; pending setup allows the same saved lookup lists.
5. Create departments **Operations** and **Administration**.
6. Create Operations position **Operations Assistant**, code **OPS-ASSIST**, and Administration position **Administrator**, code **ADMIN**.
7. Reload the page and verify departments/positions remain in selectors. Download the current template or upload the supplied two-row sample CSV. Check resolved department/position choices, complete metadata and PENDING_VERIFICATION state.
8. Reload or sign in as the second administrator. Confirm both employees are available by name; review their saved profiles, derived titles, employment type/start and masked identity.
9. Upload synthetic company registration evidence and synthetic employee identity/contract documents as administrator one. Verify files remain downloadable after an API restart, and that admin two can inspect/verify while admin one cannot approve their own uploads. Reject a test document with a reason and inspect retained status/audit.
10. Attempt maker self-activation; it must fail. As admin two independently activate both employees. Try an invalid foreign-company department/position ID and a retired position in a separate test row; it must fail without creating an active employee.
11. Refresh readiness. For the CORE_HR-only package the required company profile, registration, branding, subscription, administrator, department and employee checks must pass. Payroll, leave and attendance configuration is not required unless included in the package. Documents/position coverage should be reviewed manually as described above; do not treat an automatic readiness score as proof of all documentary evidence.
12. As a platform administrator review and activate the company. Confirm CORE_HR is enabled by the existing activation path; sign in again as the company administrator and check the normal department/employee pages and permission-filtered menu.
13. Create a second rehearsal company and verify it cannot list, download or assign the first company's records/documents. Confirm users without the required role/organization permission cannot access setup/company-wide document endpoints.
14. Verify backup/restore of both PostgreSQL and the private file store, then recheck document bytes through authenticated downloads. Record the actual full UI build/browser/migration results before using real client data.

This is a rehearsal checklist, not a claim that these live steps have already run. No real company, database migration, bank payment or external message was performed here.

## Validation

Prisma schema validation/client generation and API build passed. All 28 Jest suites / 311 tests passed, including 21 new position/import/company-document/storage tests. Targeted strict UI type/syntax checks passed. The portable `npm run test:onboarding` mock suite passed 15 authenticated/no-store HTTP/document contracts plus named/legacy CSV resolution, invalid/retired position handling, rich payloads and multipart/download checks. The tests include a real temporary-file write/read after a new storage-service instance and restrictive file modes.

Full Next.js build and browser E2E, live PostgreSQL migration/composite-constraint/rollback/concurrency checks, first-company activation and production backup/restore remain pending. Unit transaction mocks do not establish PostgreSQL rollback behavior. Complete the rehearsal above locally before treating the first client as ready.
