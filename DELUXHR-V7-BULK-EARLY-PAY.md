# DeluxHR v7 — Bulk Employees + Early Pay Pricing

## Bulk employee onboarding
- Employees page now provides a downloadable CSV template.
- Upload CSV, validate required columns and department names, preview valid row count, then import.
- Backend endpoint: `POST /employees/bulk`.
- Import is organisation-scoped, validates department IDs and duplicate employee emails, and is limited to 1,000 employees per upload.
- Individual employee creation now includes the required mobile/WhatsApp number in the UI/API payload.

CSV columns:
`firstName,lastName,email,phoneNumber,whatsappNumber,department`

## Early Pay fees
Default DeluxHR policy is now:
- Percentage transaction fee: 2%
- Standard transfer fee: R5
- Instant transfer fee: R20
- Legacy fixed service fee default: R0

The R20 instant amount is the total transfer fee, not R5 + R20.
The percentage is labelled a transaction fee, not interest.

A migration updates existing Early Pay policies to these defaults and adds `transactionFeePercentage`.

## Database update
Run `npx prisma migrate dev` in development, then `npx prisma generate`.
