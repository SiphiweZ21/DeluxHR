# Company structure flow — Batch 19

UI-only update. No API changes, migrations, database resets or seeds.

Create departments first, then department-linked positions/job roles. Saved departments and roles update immediately and appear grouped together. Attendance locations and shifts are in an expandable section.

Required onboarding fields display an asterisk and use native validation plus whitespace checks. Structure forms handle duplicate names/codes, missing departments, incomplete coordinates and invalid shift durations inline. Buttons show saving progress and prevent repeat submission. Retiring positions displays inline success/error feedback.

## Install

Stop the UI process. Replace the existing UI source with this package, preserving your .env.local. Do not nest a second deluxhr-web folder inside the existing project. Keep the existing API running.

```bash
cd /Users/siphiwezungu/Documents/DeluxHR/deluxhr-web
npm install
npm run build
npm run dev -- --port 3001
```

## Validation

Production build passed. Structure rendering checks, 19 onboarding/attendance contracts and 6 login contracts passed. Live browser/database rehearsal remains to be performed on your local environment.
