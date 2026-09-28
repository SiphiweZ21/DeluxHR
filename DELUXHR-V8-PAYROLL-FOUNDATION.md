# DeluxHR v8 — Payroll Foundation

Stage 1 implements configuration-driven payroll setup.

## Included
- Employer payroll settings: pay frequency, UIF registration, SDL applicability.
- Employee payroll profiles: tax number, salary/rate, pay frequency, bank details and bank-verification state.
- Optional benefit plans: retirement fund, medical aid or other.
- Separate employee/employer contribution methods and values.
- Fixed, percentage or no contribution; basic/pensionable/custom basis.
- Employee-specific benefit assignment (zero benefits is valid).
- Optional recurring deduction definitions and employee assignment.
- Effective-dated schema foundation for benefits and deductions.
- New Payroll Setup UI and authenticated API endpoints.

## Deliberate design rules
No pension/provident fund, medical aid, employer contribution or optional deduction is assumed. Employer and employee contribution rules are independent. Payroll profiles and assignments are organization-scoped.

## Next stage
Build the tax-year-versioned South African payroll/tax engine and immutable payroll ledger on top of these profiles. The existing temporary payroll tax calculation is NOT production tax logic.
