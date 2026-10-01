# DeluxHR - Persistent login errors and five-attempt limit (Batch 18)

This cumulative package includes previous required-profile, pending access, corrected migration order, COIDA/PSiRA and WhatsApp attendance changes. No database migration or credential change is introduced in this batch.

## Fix

The login request previously used the shared authenticated-response handler. A 401 from a wrong email/password was interpreted as an expired session, which redirected/reloaded /login and erased the visible error. Login now handles its own unauthenticated responses and leaves the form/error on screen. Protected requests keep the existing session-expiry behavior.

Errors distinguish invalid credentials, malformed inputs, account/company restrictions, temporary server problems and network failure. Raw server errors are not displayed for 5xx. Credential errors do not reveal whether the email exists. Failed attempts include a remaining-attempt count. Errors use an accessible alert region.

The API tracks failed credential checks by normalized email. The first four failures return 401 with attempts remaining. The fifth returns 429 with remainingAttempts=0, retryAfterSeconds and a Retry-After header. Further attempts are rejected until the 15-minute window expires. The window starts on the first incorrect attempt. Successful sign-in resets failures. 403 restrictions and server errors are not counted as incorrect passwords. Existing per-IP request throttling remains to limit request floods.

The UI disables submission for the blocked email until the server-provided retry interval ends and displays a countdown. Changing email allows another account to be used, while the API still enforces the blocked email. Refreshing the page does not bypass the API limit.

IMPORTANT: The current rate-limit service stores counters in API process memory, matching the existing infrastructure. An API restart resets them; separate API replicas do not share them. A persistent/shared store is still required before relying on this limit across production replicas or restarts. This batch is appropriate for the current single-process local rehearsal but does not claim durable platform-wide lockouts.

## Install

Stop API/UI, update both project sources and preserve .env, .env.local and private document storage. Keep DATABASE_URL pointed at deluxhr_rehearsal. Do not seed or reset the database. This update preserves all users and passwords.

API, from DeluxHR/:

```bash
npm install
npm run build
npm run start:dev
```

UI, from deluxhr-web/:

```bash
npm install
npm run test:login
npm run build
npm run dev -- --port 3001
```

Try signing in once after restarting. The actual error should now stay visible. The fix does not establish whether your local password, account data or database configuration is correct; it makes that failure diagnosable.

If both admin@test.com and superadmin@deluxhr.test still fail, verify .env targets the rehearsal database and inspect accounts WITHOUT reading password hashes:

```bash
psql "postgresql://siphiwezungu@localhost:5432/deluxhr_rehearsal" -X -P pager=off <<'SQL'
SELECT "email", "role", "isActive", "organizationId"
FROM "User"
WHERE "email" IN ('admin@test.com', 'superadmin@deluxhr.test');
SQL
```

## Verification

API and full Next.js builds passed. API suite: 33 suites / 359 tests. These include remaining attempts, fifth-attempt rejection, email normalization, expiry, success reset, non-credential failure handling and Retry-After. Six UI login contracts passed (401 handling, no redirect, 429 retry, safe 5xx message, 403 status message, network failure and success paths); existing 19 onboarding/attendance contracts also passed. Live local-account sign-in and browser countdown testing remain to be rehearsed.
