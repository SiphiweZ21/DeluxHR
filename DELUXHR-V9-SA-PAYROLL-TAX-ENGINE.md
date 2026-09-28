# DeluxHR v9 — South African Payroll / Tax Engine (Stage 2)

## Implemented
- Versioned South African tax rules for the 2026/27 tax year (1 Mar 2026–28 Feb 2027).
- Progressive PAYE brackets and age-based primary/secondary/tertiary rebates.
- Medical scheme fees tax credits when an employee is actually assigned a medical-aid benefit.
- UIF employee and employer contributions with the R17,712 monthly remuneration ceiling.
- SDL employer contribution when SDL is enabled for the employer.
- Optional retirement-fund employee/employer contributions, including a Stage-2 annualised 27.5% / R350,000 deduction limit.
- Optional employer benefits and employee recurring deductions remain configuration-driven.
- Early Pay paid amounts are recovered during payroll.
- Payroll run stores a calculation snapshot, tax year, PAYE/UIF/SDL, benefit/deduction totals and total employer cost.
- Date of birth added to the employee payroll profile for age-based rebates.

## Important production boundary
This stage replaces the temporary flat 18% PAYE calculation for the supported 2026/27 regular-payroll path, but it is not yet a payroll-compliance certification. Before live payroll, DeluxHR still needs YTD/cumulative handling, complete SARS variable-remuneration rules, tax directives, allowances/fringe benefits, ETI, termination/lump-sum cases, IRP5 source-code mapping, reconciliation and professional payroll/tax validation.

## Design principle
Pension/provident funds, medical aid, employer contributions and other deductions are optional. No benefit is assumed. Tax/benefit calculations only include items configured for the employer and assigned to the employee.
