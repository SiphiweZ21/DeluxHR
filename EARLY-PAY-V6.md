# DeluxHR v6 — Early Pay

## Implemented
- Employer Early Pay policy and configurable eligibility/fee rules.
- Eligibility based on estimated **net earned pay** after PAYE/UIF/protected-deduction reserves.
- Qualifying days from approved timesheets, falling back to completed attendance days.
- Payday cutoff, request-count cap, min/max withdrawal and accessible-net-pay percentage.
- Request lifecycle: PENDING → APPROVED → PROCESSING → PAID → RECOVERED, plus rejection/failure/cancellation states.
- Manual HR/payroll review and simulated payment processing.
- Payroll recovery of paid Early Pay principal + fees; request becomes RECOVERED when payroll is marked PAID.
- Calculation snapshot and audit logs.
- WhatsApp menu option 4 with quote → amount → Standard/Instant → fee disclosure → confirmation → pending approval.
- Admin Early Pay dashboard and policy editor.

## Important tax boundary
The PAYE/UIF percentages in the Early Pay policy are eligibility reserves only. They protect the amount made available to employees; they are not a replacement for the final statutory payroll calculation. The existing payroll module still contains its pre-existing temporary 18% tax calculation and must be replaced with an authoritative South African payroll tax engine before production use.

## After extracting
Keep your existing `.env` and `.env.local`, then from API/DeluxHR run:

    npm install
    npx prisma generate
    npx prisma migrate dev
    npm run start:dev

Then from UI/deluxhr-web:

    npm install
    npm run dev -- -p 3001

Open `/early-pay`.
