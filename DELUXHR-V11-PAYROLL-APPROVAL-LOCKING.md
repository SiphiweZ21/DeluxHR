# DeluxHR v11 — Payroll Approval & Locking

Stage 4 adds a controlled payroll lifecycle: DRAFT → CALCULATED → REVIEWED → APPROVED → LOCKED → PAYMENT_PROCESSING → PAID, with cancellation permitted only before locking.

Generated payroll begins at CALCULATED. Lifecycle actions retain actor IDs and timestamps and append status-history rows. Employer payroll settings support SINGLE_APPROVER or MAKER_CHECKER. In maker/checker mode, the user who calculated or reviewed a run cannot approve it.

Recalculation is limited to DRAFT/CALCULATED payroll. Locked payroll cannot be recalculated or cancelled. Payslip generation requires LOCKED, PAYMENT_PROCESSING or PAID status.
