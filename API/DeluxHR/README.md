Latest onboarding delivery: [ONBOARDING_POSITIONS_DOCUMENTS_BATCH14.md](ONBOARDING_POSITIONS_DOCUMENTS_BATCH14.md) — positions, saved lookups, rich imports and private company/employee documents, with a first-company rehearsal checklist.

Latest payment delivery: see [REMITTANCE_PREPARATION_BATCH5.md](REMITTANCE_PREPARATION_BATCH5.md) for installation, migration, routes, acceptance checks and bank-file limitations.

# DeluxHR 6A.16 — Attendance Permissions & Security

Security decisions locked in this stage:

- EMPLOYEE receives VIEW_ATTENDANCE with SELF scope so existing employee attendance
  endpoints can pass their permission guards. The attendance services still resolve
  the employee from the authenticated user and do not accept another employee identity.
- EMPLOYEE VIEW_ATTENDANCE cannot be elevated above SELF through an explicit grant.
- MANAGER VIEW_ATTENDANCE is restricted to TEAM scope.
- MANAGER and EMPLOYEE are hard-denied MANAGE_ATTENDANCE, including explicit grants,
  until DeluxHR has a formal manager/team membership model that can safely enforce
  mutation targets.
- COMPANY_ADMIN and HR_ADMIN remain the attendance writers for now.
- General attendance history no longer returns exact latitude/longitude.
  It returns whether location evidence was captured, plus verification status/distance.
- Attendance correction lookup no longer returns a raw AttendanceEvent object, preventing
  accidental disclosure of exact coordinates or unrestricted event metadata.
- Existing tenant guards, ATTENDANCE entitlement, QR/PIN/device controls, offline
  idempotency, immutable corrections and no-automatic-payroll-effect rules remain.

Manager decision:
We do not equate department membership with manager team membership. Manager write
access will be introduced only after an explicit team/supervisor relationship exists.

No Prisma migration is required.

Install:

unzip -o "$HOME/Downloads/deluxhr-6a16-attendance-permissions-security.zip" -d .

npx prisma format
npx prisma validate
npx prisma generate
npm run build

Do NOT run prisma migrate dev for 6A.16.
