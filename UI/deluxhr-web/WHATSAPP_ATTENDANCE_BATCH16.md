# DeluxHR - WhatsApp attendance location and UI history (Batch 16)

This is a cumulative API + UI source package, including Batch 15 COIDA/PSiRA support. Preserve existing .env/.env.local, database and private storage before replacing sources. Back up the database and uploaded files first.

## Employee flow

1. Employee must be active, opted into WhatsApp, have a linked portal user and be enrolled with a WhatsApp PIN.
2. Company must have WhatsApp and Attendance enabled. The effective attendance policy must allow WHATSAPP capture.
3. Employee verifies their PIN, then selects 6 (clock in) or 7 (clock out).
4. DeluxHR asks the employee to use Attach (+ / paperclip) > Location > Send your current location within five minutes. No attendance event is created on the menu selection alone.
5. A signed location webhook is accepted only for the configured business phone number. Coordinates must be numeric, finite, latitude -90 to 90 and longitude -180 to 180. Missing, malformed or unsolicited locations do not create attendance.
6. DeluxHR rechecks Attendance entitlement and the attendance sequence, atomically claims the pending request, then creates an AttendanceEvent with WHATSAPP channel, coordinates, active primary site assignment if present, server capture time, the location message ID and evidence metadata WHATSAPP_SHARED_PIN.
7. The pending action expires after five minutes. Reply 0 to cancel. An expired PIN session requires verification again and clears the pending flow.
8. On a capture error, the response asks the employee to check attendance status (option 5) before retrying; capture might have succeeded before a downstream audit failure.

Location is employee-shared coordinate evidence. The webhook does not prove the employee's physical presence, coordinate accuracy, or whether they selected a current-location pin rather than another pin. No GPS accuracy is invented. This batch does not add geofence distance enforcement or mark site verification as successful. Existing attendance policy checks are retained. Live location updates and map-link text are not handled as this static location flow.

Duplicate provider message IDs retain the existing inbound deduplication. The pending session claim prevents two deliveries from using the same pending action. Fully concurrent actions across other capture channels remain a database rehearsal case rather than a claim of universal concurrency protection.

## Attendance UI

The Attendance page now displays a paginated Attendance events section above existing web session controls/history. It shows employee/department, check-in/check-out, capture timestamp, channel, assigned site, shared coordinates and site verification status. Refresh and previous/next controls are included; requests use private/no-store responses. Event loading errors are independent of the older session list, so a failure fetching older records does not hide WhatsApp event errors or results.

The web session summary and buttons continue to operate on the existing AttendanceRecord API. Raw AttendanceEvents are not converted into sessions or added to session-hour metrics; doing so would risk double counting captures from different data models. Finish a WhatsApp check-in with WhatsApp option 7. Assigned sites and shared coordinates are separate fields.

The new GET /attendance-events?page=1 endpoint is tenant-scoped and requires ATTENDANCE and VIEW_ATTENDANCE through the existing auth/tenant/feature/permission guards. Pages contain 50 events, newest first with an ID tie-breaker. Existing per-employee and individual-event endpoints remain.

## Installation

Extract the API DeluxHR/ and UI deluxhr-web/ folders into a review directory first. Preserve existing environment configuration and storage paths. No secrets, node_modules, generated builds or uploads are included.

API terminal, from DeluxHR/:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm run start:dev
```

UI terminal, from deluxhr-web/, with NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 in .env.local:

```bash
npm ci
npm run test:onboarding
npm run build
npm run dev -- --port 3001
```

Batch 16 uses existing attendance/session columns and needs no additional migration. If Batch 15 has not been installed, its 20260930190000_compliance_evidence migration is included and migrate deploy will apply it.

For WhatsApp testing, use a reachable HTTPS API webhook /whatsapp/webhook with WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN and WHATSAPP_PHONE_NUMBER_ID configured. Outbound responses use the existing WhatsApp service configuration. Do not use real identity documents or production payroll for this rehearsal.

## Validation

Full API suite passed: 30 suites / 345 tests. These include location prompting, PIN requirement, check-in/check-out coordinates, invalid values, unsolicited/cancelled/expired locations, changed sequence, disabled entitlement, policy failure, signed location webhook forwarding and tenant pagination. UI request contracts passed (18 checks plus existing CSV/import cases), including the attendance event URL and no-store behavior. API and full Next.js production builds passed. The UI build used system TLS certificates for the existing Google Font fetch.

A real WhatsApp conversation, PostgreSQL session-claim concurrency, live attendance policy behavior and browser interaction have not been exercised in this environment.

## Rehearsal checklist

- [ ] Enroll an opted-in synthetic employee and independently confirm company services/site policy.
- [ ] Verify PIN; choose 6; confirm no attendance event before location is sent.
- [ ] Send a current location; confirm success and inspect the Attendance events row with WHATSAPP and both coordinates.
- [ ] Choose 7 and send location; confirm a separate CHECK OUT row.
- [ ] Confirm assigned site is shown independently of coordinates and site verification is not falsely marked verified.
- [ ] Test text/map link instead of location, unsolicited location, cancellation and five-minute expiry.
- [ ] Confirm duplicate inbound delivery and already-claimed request do not create another capture.
- [ ] Disable attendance or disallow WHATSAPP in site policy; confirm capture fails without a success reply.
- [ ] Sign in as another company and confirm it cannot read these events.
- [ ] Refresh and paginate event history; confirm existing web sessions and controls still work.

Payload reference: Meta's official WhatsApp Cloud API Postman collection, Received Static Location Messages: https://www.postman.com/meta/whatsapp-business-platform/request/ntthgns/received-static-location-messages .
