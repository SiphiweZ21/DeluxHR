# Service access, navigation and payment workflows

## Apply this batch
Replace both projects with the cumulative packages, preserving .env and .env.local. Run npm ci and npm run build in each project, then restart the API and UI. No migration is required.

Sign in as COMPANY_ADMIN and open Company & Access → Services. The screen shows configured flags, effective availability and subscription status. Restore missing Core HR for an active legacy company, or enable the services included in its active subscription with a reason. Enable Payroll before Payslips or Early Pay. Missing, expired or paused subscriptions require a platform administrator to assign/renew an appropriate package. No live data or subscription was changed by this delivery.

Menus use effective service availability and actual permission scopes. Six collapsible groups and search shorten navigation on desktop and mobile. Known direct routes are gated before their page requests run. Services remains accessible for diagnosis. Dashboard requests skip inaccessible modules. Existing role presets still apply alongside explicit grants; this is not an explicit-deny permission system. Company-wide workforce pages remain hidden from employee/manager roles until suitable scoped UI exists. Pending onboarding and the separate platform workspace retain their routing.

Earnings APIs now require payroll view/manage permissions. Early Pay administration APIs require their administrative permissions; personal requests require REQUEST_EARLY_PAY and the active linked employee record belonging to the current user.

## Payment files
A file download or submission record does not transfer money. Each payment stream needs its own batch, independent approval, bank upload, authorization and confirmed-result reconciliation.

| Stream | Payer and recipient | Source and current support |
| --- | --- | --- |
| Payroll salaries | Company → employees | Locked payroll and approved bank details. Existing prepare, independent approval, validation, generic export, submission recording and result reconciliation. Generic CSV is not a bank-import format. |
| Early Pay payout | DeluxHR → employee | Approved requests. Current processPayment is a simulation using SIM references; there is no platform bank payout file or actual bank transfer. |
| Payroll liabilities | Company → authorities/other creditors | Posted liability register. Existing CSV is a report and remittance records track accounting confirmation; neither initiates bank payments. |
| Early Pay repayment | Company → DeluxHR | EARLY_PAY_RECOVERY deduction ledger, principal and agreed fees. This is excluded from the ordinary liability register and needs a separate settlement file. RECOVERED on payroll does not establish that DeluxHR received money. |

For payroll: lock the run, prepare payment snapshots, validate approved beneficiary details and amounts, have an independent authorized checker approve release, export the bank's exact supported format, upload through the company's banking portal, authorize there and record/import the confirmed bank results. Reconcile partial failures before retrying failed items.

For Early Pay: implement a DeluxHR finance batch of approved requests, snapshot beneficiaries/amounts, independently approve, export the exact funding-account bank format, upload and authorize from DeluxHR banking, then confirm actual results before marking requests paid. The current simulated process must not be treated as evidence of a transfer.

For liabilities: implement verified creditor beneficiaries and required references, batch approved outstanding liabilities, independently approve, export the company bank format, upload/authorize and reconcile confirmed results against remittances.

For Early Pay repayment: prepare a separate employer-to-DeluxHR settlement batch from posted payroll recoveries, with company/period references and request-level allocation. Export to the company's bank format using the verified DeluxHR beneficiary, authorize in banking and reconcile the incoming receipt. Employee salary payments already reflect deductions and must not be duplicated.

The current exporter offers DELUXHR_GENERIC_CSV with directlyBankImportable=false. Standard Bank, FNB, ABSA and Nedbank adapters remain SPECIFICATION_REQUIRED placeholders. Implementing bank files requires the exact bank, business banking product and official import specification or blank template. New payout/remittance/settlement pipelines also need duplicate prevention, partial-result handling and receipt reconciliation; those pipelines are not implemented in this navigation batch.

## Validation
API production build passed. 19 Jest suites / 91 tests passed. Targeted strict UI TypeScript and syntax checks passed, as did menu access cases covering disabled services, permission scopes, employee linkage, nested routes and restricted settings. Full frontend build and browser/responsive E2E remain pending because frontend dependencies could not be installed in this environment. No live API writes or database repair was performed.
