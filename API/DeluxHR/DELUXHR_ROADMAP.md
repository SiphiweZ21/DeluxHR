# DeluxHR development roadmap

DeluxHR is the current product name (previously FluxHR). Tagline: **Modern HR. Smarter Workforce.** Positioning: Modern HR platform for SMEs with built-in workforce intelligence and planning.

Status on 29 September 2026: Phases 6B.1–6B.13, 6C.1–6C.13, 6D.1–6D.14, 6E.1–6E.14, 6F.1–6F.15, 6G.1–6G.14, 6H.1–6H.12, 5G.1–5G.13, 7.1–7.13, 8.1–8.19 and 9.1–9.16 have API implementations. The final checkpoints 6B.14, 6C.14, 6D.15, 6E.15, 6F.16, 6G.15, 6H.13, 5G.14, 7.14, 8.20 and 9.17 are deferred for a combined live database and integration pass, as requested. Local schema validation, builds, boot smoke testing and targeted tests passed. Phase 10 security hardening is in progress: JWT, auth throttling, payroll permissions, organization-wide attendance/timesheet queue guards, document signatures, response headers and targeted regression tests are implemented. The complete endpoint audit, live two-company isolation, online dependency scan, and 10.16 sign-off remain open; see PHASE_10_SECURITY.md.

## Phase 6B — Shifts, Schedules & Attendance Exceptions
6B.1 Shift definitions; 6B.2 Employee/team shift assignment; 6B.3 Recurring schedules; 6B.4 Grace periods; 6B.5 Late arrival detection; 6B.6 Early departure detection; 6B.7 Missing attendance detection; 6B.8 Expected absence detection; 6B.9 Attendance exception workflow; 6B.10 Employee explanation; 6B.11 Supervisor review/correction; 6B.12 Leave-aware attendance; 6B.13 Site-aware scheduling; 6B.14 Final build checkpoint.

## Phase 6C — Timesheets, Overtime & Workforce Hours
6C.1 Daily timesheet generation; 6C.2 Weekly/monthly timesheets; 6C.3 Worked-hours calculation; 6C.4 Break-time calculation; 6C.5 Scheduled vs actual hours; 6C.6 Overtime rules; 6C.7 Overtime calculation; 6C.8 Overtime approval workflow; 6C.9 Manual timesheet adjustments; 6C.10 Supervisor timesheet review; 6C.11 Timesheet approval; 6C.12 Locked payroll periods; 6C.13 Timesheet reporting; 6C.14 Final build checkpoint.

## Phase 6D — Leave Policy Engine
6D.1 Leave policy definitions; 6D.2 Leave entitlement rules; 6D.3 Accrual rules; 6D.4 Leave balance calculation; 6D.5 Carry-over rules; 6D.6 Leave expiry rules; 6D.7 Negative balance rules; 6D.8 Probation leave rules; 6D.9 Employee-specific policies; 6D.10 Leave calendar; 6D.11 Public holiday integration; 6D.12 Working-day calculations; 6D.13 Leave balance adjustments; 6D.14 Leave audit trail; 6D.15 Final build checkpoint.

## Phase 6E — Leave Documents & Approval Workflows
6E.1 Configurable approval chains; 6E.2 Manager approval; 6E.3 HR approval; 6E.4 Multi-level approvals; 6E.5 Delegated approvers; 6E.6 Leave document upload; 6E.7 Supporting-document requirements; 6E.8 Medical certificate support; 6E.9 Approval comments; 6E.10 Rejection reasons; 6E.11 Cancellation workflow; 6E.12 Leave amendment workflow; 6E.13 Approval notifications; 6E.14 Leave history; 6E.15 Final build checkpoint.

## Phase 6F — WhatsApp Employee Self-Service 2.0
6F.1 Employee identity verification; 6F.2 Employee profile lookup; 6F.3 Leave balance enquiry; 6F.4 Leave request; 6F.5 Leave request status; 6F.6 Attendance status; 6F.7 Clock-in/clock-out support; 6F.8 Attendance exception explanation; 6F.9 Payslip request; 6F.10 Payslip secure delivery; 6F.11 HR request creation; 6F.12 HR request status; 6F.13 Company announcements; 6F.14 WhatsApp audit trail; 6F.15 Security/rate limiting; 6F.16 Final build checkpoint.

## Phase 6G — HR Service Desk & Employee Requests
6G.1 HR request categories; 6G.2 Employee request creation; 6G.3 Request reference numbers; 6G.4 Request assignment; 6G.5 HR queue; 6G.6 Priority levels; 6G.7 Request statuses; 6G.8 Internal HR notes; 6G.9 Employee comments; 6G.10 Document attachments; 6G.11 Request escalation; 6G.12 SLA tracking; 6G.13 Request history; 6G.14 Service desk reporting; 6G.15 Final build checkpoint.

## Phase 6H — Employee Communications
6H.1 Announcement creation; 6H.2 Company-wide announcements; 6H.3 Department announcements; 6H.4 Location/team targeting; 6H.5 Scheduled announcements; 6H.6 Employee notifications; 6H.7 Announcement acknowledgement; 6H.8 Read/unread tracking; 6H.9 Important/pinned announcements; 6H.10 Document attachments; 6H.11 Announcement expiry; 6H.12 Communication history; 6H.13 Final build checkpoint.

## Phase 5G — Payroll Liabilities & Remittances
5G.1 PAYE liability summary; 5G.2 UIF liability summary; 5G.3 SDL liability summary; 5G.4 Employee deductions summary; 5G.5 Employer contribution summary; 5G.6 Payroll liability register; 5G.7 Monthly remittance summary; 5G.8 Payment status tracking; 5G.9 Liability adjustments; 5G.10 Payroll reconciliation; 5G.11 Payroll period reporting; 5G.12 Export support; 5G.13 Audit trail; 5G.14 Final build checkpoint.

## Phase 7 — Platform Administration
7.1 Platform admin authentication; 7.2 Company/tenant management; 7.3 Company status management; 7.4 Subscription/package management; 7.5 Feature entitlements; 7.6 User administration; 7.7 Company administrator management; 7.8 Usage statistics; 7.9 Platform audit logs; 7.10 Support impersonation controls; 7.11 Company suspension/reactivation; 7.12 Platform configuration; 7.13 System health overview; 7.14 Final build checkpoint.

## Phase 8 — Customer & Company Onboarding
8.1 Create company; 8.2 Company profile setup; 8.3 Company logo/branding; 8.4 Company registration details; 8.5 Payroll configuration; 8.6 Leave policy setup; 8.7 Work locations setup; 8.8 Departments setup; 8.9 Shift setup; 8.10 Public holidays setup; 8.11 Administrator creation; 8.12 Employee bulk import; 8.13 Employee validation; 8.14 Opening leave balances; 8.15 Opening payroll information; 8.16 Onboarding checklist; 8.17 Setup progress indicator; 8.18 Go-live readiness check; 8.19 Activate company; 8.20 Final build checkpoint.

## Phase 9 — Reporting & Workforce Intelligence
9.1 Executive workforce dashboard; 9.2 Headcount trends; 9.3 Workforce cost trends; 9.4 Attendance trends; 9.5 Absenteeism analysis; 9.6 Late-arrival trends; 9.7 Overtime analysis; 9.8 Leave utilisation; 9.9 Department comparisons; 9.10 Location comparisons; 9.11 Payroll trends; 9.12 Workforce movement; 9.13 Employee turnover metrics; 9.14 HR service metrics; 9.15 Date-range filtering; 9.16 Report export; 9.17 Final build checkpoint.

## Phase 10 — Security, Audit & Compliance Hardening
10.1 Role/permission review; 10.2 Tenant isolation testing; 10.3 Authentication hardening; 10.4 API authorization review; 10.5 Sensitive data protection; 10.6 Document access controls; 10.7 Payroll access controls; 10.8 Audit-log completeness; 10.9 Rate limiting; 10.10 Input validation; 10.11 File upload security; 10.12 Session/token security; 10.13 Environment/secrets review; 10.14 Dependency vulnerability scan; 10.15 Security regression tests; 10.16 Final security checkpoint.

## Phase 11 — Full End-to-End Testing & QA
11.1 Company onboarding E2E; 11.2 Employee lifecycle E2E; 11.3 Department/team E2E; 11.4 Leave E2E; 11.5 Attendance E2E; 11.6 Shift/scheduling E2E; 11.7 Timesheet E2E; 11.8 Payroll E2E; 11.9 Payslip E2E; 11.10 WhatsApp E2E; 11.11 HR service desk E2E; 11.12 Communications E2E; 11.13 Permissions E2E; 11.14 Multi-company isolation E2E; 11.15 Regression suite; 11.16 Performance testing; 11.17 Mobile/responsive testing; 11.18 Browser compatibility; 11.19 Production readiness checklist; 11.20 Release sign-off.

## Phase 12 — Production Infrastructure & Deployment
12.1 Reserve DeluxHR domain; 12.2 Production hosting; 12.3 Production database; 12.4 Production object/file storage; 12.5 Production environment variables; 12.6 DNS configuration; 12.7 SSL/HTTPS; 12.8 Email service; 12.9 WhatsApp production configuration; 12.10 Database backups; 12.11 Monitoring; 12.12 Error tracking; 12.13 Logging; 12.14 Uptime monitoring; 12.15 CI/CD pipeline; 12.16 Staging environment; 12.17 Production deployment; 12.18 Smoke testing; 12.19 Rollback procedure; 12.20 Final production checkpoint.

## Phase 13 — First Customer Go-Live
13.1 Select pilot company; 13.2 Create production tenant; 13.3 Configure company; 13.4 Import employees; 13.5 Configure leave policies; 13.6 Configure locations; 13.7 Configure shifts; 13.8 Configure payroll; 13.9 Validate opening balances; 13.10 Administrator training; 13.11 Employee onboarding; 13.12 First attendance cycle; 13.13 First leave cycle; 13.14 First payroll cycle; 13.15 First payslip generation; 13.16 Customer feedback; 13.17 Production issue fixes; 13.18 Pilot sign-off.

Sequence: 6B → 6C → 6D → 6E → 6F → 6G → 6H → 5G → 7 → 8 → 9 → 10 → 11 → 12 → 13.
