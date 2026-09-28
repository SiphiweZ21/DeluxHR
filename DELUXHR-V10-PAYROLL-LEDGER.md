# DeluxHR v10 — Stage 3 Payroll Ledger

Stage 3 introduces an append-only payroll calculation ledger for payroll runs generated from approved earnings.

## Design rules

- Ledger entries are snapshots created at payroll calculation time; reads never recalculate them.
- Each entry retains category, effect, code, amount, creditor/recipient and source references.
- Zero-value optional benefits/deductions do not create fake ledger entries.
- Draft recalculation deletes and regenerates the draft payroll run and its ledger. Once a run has left DRAFT, the existing recalculation guard prevents regeneration.
- Stage 4 will add the richer CALCULATED/LOCKED approval lifecycle and maker/checker controls.

## Ledger categories

EARNING, STATUTORY_DEDUCTION, BENEFIT_DEDUCTION, OTHER_DEDUCTION, EARLY_PAY_RECOVERY, EMPLOYER_CONTRIBUTION, EMPLOYER_STATUTORY, NET_PAY.

## Captured examples

- Each source earning separately (salary, overtime, bonus, commission, etc.)
- PAYE
- Employee UIF
- Employer UIF
- SDL
- Employee benefit contributions when applicable
- Employer benefit contributions when applicable
- Recurring deductions when applicable
- Each paid Early Pay recovery separately
- Net pay settlement

## API

`GET /payroll-runs/:id` includes `ledgerEntries` ordered by sequence.

`GET /payroll-runs/:id/ledger` returns the ledger only.

## UI

Payroll Runs now includes **View ledger** for each run. Older payroll runs created before Stage 3 legitimately show no ledger entries.
