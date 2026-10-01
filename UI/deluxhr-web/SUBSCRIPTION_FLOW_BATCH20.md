# Platform company subscription flow — Batch 20

UI-only update; no API, migrations or entitlement data changes.

Super Admin assigns the company package. Company administrators complete onboarding. Super Admin reviews readiness and activates the company.

The Subscription & features tab now explains this sequence, previews the selected package and employee limit, marks required fields, describes status and expiry, and provides a clear empty-package action. Saved access is shown with readable service names. Individual feature overrides are grouped in an Advanced section, with specific dependency guidance. Inline validation checks trimmed reasons, package selection and expiry; failed loads offer retry and block editing stale settings.

Installation: stop the UI, merge this source into the existing deluxhr-web folder, preserve .env.local, then run npm install, npm run build and npm run dev -- --port 3001. Keep the API running. Do not nest another deluxhr-web directory.
