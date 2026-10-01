# Core HR default and optional editions — Batch 21

Includes API and UI sources. This replaces the previous package-first flow.

## Behaviour

Core HR is included by default, even without a subscription. A paused/cancelled/expired optional subscription does not remove Core HR; tenant status and user permissions still control access. Core HR cannot be disabled separately.

The edition catalogue contains standard Core HR, Core HR + Leave, Core HR + Attendance & Timesheets, Core HR + Payroll, and Complete editions. The migration makes existing catalogue entries available and adds these editions, without subscribing companies to optional services. New/custom editions are always active. Subscribed edition terms remain immutable. The advanced custom edition editor is collapsed.

Company subscription selection is optional for a Core HR company. Selecting an edition replaces additional feature choices; individual overrides remain under Advanced. The saved feature choices determine required onboarding tasks (including overrides, independent of subscription status).

Leave requires leave types/policies, holiday review and opening balances. Attendance/Timesheets require locations and shifts. Payroll/Payslips/Early Pay require payroll settings, tax registration and opening payroll coverage/verification. Existing Company Setup endpoints remain available to complete setup. Feature-guarded operational API routes return MODULE_SETUP_REQUIRED with a friendly administrator-assistance message when these checks fail. Company activation still requires the full checklist for selected services.

The UI is shorter: Core HR included, optional edition selector, compact selected services. Status/expiry, per-service overrides and custom editions are expandable.

## Install

Stop API and UI. Merge DeluxHR/ into your existing API folder and deluxhr-web/ into your existing UI folder. Preserve .env, .env.local and uploaded documents. Do not nest new project folders inside the existing folders.

API:
```bash
cd /Users/siphiwezungu/Documents/DeluxHR/DeluxHR
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
npm run start:dev
```

UI (second terminal):
```bash
cd /Users/siphiwezungu/Documents/DeluxHR/deluxhr-web
npm install
npm run build
npm run dev -- --port 3001
```

Use the rehearsal database in the API .env. No reset or seed is needed. The new migration creates the edition catalogue and enables baseline Core HR only. Refresh readiness after restarting.

## Validation

API and UI production builds passed. API: 34 suites / 364 tests passed, including default Core HR onboarding and the optional module setup guard. Structure rendering, 19 onboarding/attendance contracts and 6 login contracts passed. The migration has not been executed against your database; live browser and database rehearsal remains to be performed locally.
