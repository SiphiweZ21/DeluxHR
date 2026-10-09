-- Existing published announcements remain visible; new ones await review.
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'VIEW_LEAVE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'APPROVE_LEAVE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'APPROVE_COMMUNICATIONS';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'VIEW_EARLY_PAY';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'PREPARE_EARLY_PAY';
ALTER TABLE "LeaveRequest" ADD COLUMN "submittedByUserId" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN "submittedByUserId" TEXT;
ALTER TABLE "EarlyPayRequest" ADD COLUMN "submittedByUserId" TEXT;
ALTER TABLE "WorkforceAnnouncement" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED', ADD COLUMN "reviewedByUserId" TEXT, ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewReason" TEXT;
ALTER TABLE "WorkforceAnnouncement" ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';
ALTER TABLE "WorkforceAnnouncement" ADD CONSTRAINT "announcement_approval_status" CHECK ("approvalStatus" IN ('PENDING','APPROVED','REJECTED'));
UPDATE "LeaveRequest" r SET "submittedByUserId" = a."actorUserId" FROM "AuditLog" a WHERE a."entityId" = r.id AND a."organizationId" = r."organizationId" AND a.action = 'LEAVE_REQUEST_SUBMITTED';

CREATE TABLE "EmployeeProfileChange" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE, "proposed" JSONB NOT NULL, "baseUpdatedAt" TIMESTAMP(3) NOT NULL, "submittedByUserId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')), "reviewedByUserId" TEXT, "reviewedAt" TIMESTAMP(3), "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "EmployeeProfileChange_organizationId_status_idx" ON "EmployeeProfileChange"("organizationId", "status");
CREATE UNIQUE INDEX "EmployeeProfileChange_one_pending" ON "EmployeeProfileChange"("organizationId", "employeeId") WHERE "status" = 'PENDING';

ALTER TABLE "Employee" ADD COLUMN "lastSubmittedByUserId" TEXT;
