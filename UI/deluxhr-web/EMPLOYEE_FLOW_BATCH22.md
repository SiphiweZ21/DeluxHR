# Employee onboarding flow — Batch 22

UI-only update. No API or database migration required beyond the prior Batch 21 update.

Fixed saved lists not loading on opening onboarding: authenticated company administrators now load tenant lookups automatically, with visible loading/failure state and a local retry button. Department/position prerequisites are explicit. New employee department and position are required in this structured UI; the API retains older job title support. Positions belong to the chosen department and must be active. New employees immediately update saved choices.

The page follows Add employees, Review/complete profiles and Independent verification. Department and job role are first in the new employee form. Examples appear for names, phone, email and legacy job title. Bulk CSV and profile correction are expandable. Existing profile department/position changes can be left blank to retain current values. Review displays names rather than requiring copied IDs; activation choices show pending verification records only. CSV preview displays department names, and uploads are disabled while lookup lists are loading or failed.

## Install

Stop the UI. Merge this deluxhr-web source into the existing UI folder (do not nest another deluxhr-web folder). Preserve .env.local. Keep the API running.

```bash
cd /Users/siphiwezungu/Documents/DeluxHR/deluxhr-web
npm install
npm run build
npm run dev -- --port 3001
```

## Validation

Production build passed. Structure rendering, 19 onboarding/attendance HTTP contracts and 6 login contracts passed. Live browser/database rehearsal still needs to be performed on the local company.
