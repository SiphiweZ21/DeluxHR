# DeluxHR Rebrand

Brand: **DeluxHR**  
Tagline: **Modern HR. Smarter Workforce.**

## Rebranded
- Web UI branding, login, navigation, metadata and workspace labels
- Early Pay and payslip UI copy
- WhatsApp Employee Services copy
- Payslip PDF branding
- Package names: `deluxhr-web` and `deluxhr-api`
- Auth cookie: `deluxhr_token`
- Portal environment variable: `DELUXHR_PORTAL_BASE_URL`
- Project folders: `UI/deluxhr-web` and `API/DeluxHR`
- Demo/seed branding references

## Intentionally preserved
The local PostgreSQL database name, JWT secret value and WhatsApp verify-token value were not changed. These are operational values rather than customer-facing branding, and changing them could break the current local environment. They can be rotated separately when desired.

## Run
API:
```bash
cd API/DeluxHR
npm install
npx prisma generate
npm run start:dev
```

Web:
```bash
cd UI/deluxhr-web
npm install
npm run dev -- -p 3001
```

Existing browser sessions will need to sign in again because the auth cookie name changed from the old brand to `deluxhr_token`.
