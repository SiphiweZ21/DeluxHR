ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'CALCULATED';
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'LOCKED';
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PROCESSING';

CREATE TYPE "PayrollApprovalMode" AS ENUM ('SINGLE_APPROVER', 'MAKER_CHECKER');

ALTER TABLE "PayrollSettings" ADD COLUMN "approvalMode" "PayrollApprovalMode" NOT NULL DEFAULT 'SINGLE_APPROVER';

ALTER TABLE "PayrollRun"
ADD COLUMN "calculatedByUserId" TEXT,
ADD COLUMN "calculatedAt" TIMESTAMP(3),
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "lockedByUserId" TEXT,
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "paymentProcessingByUserId" TEXT,
ADD COLUMN "paymentProcessingAt" TIMESTAMP(3),
ADD COLUMN "paidByUserId" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE TABLE "PayrollRunStatusHistory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "fromStatus" "PayrollRunStatus",
  "toStatus" "PayrollRunStatus" NOT NULL,
  "changedByUserId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollRunStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollRunStatusHistory_organizationId_idx" ON "PayrollRunStatusHistory"("organizationId");
CREATE INDEX "PayrollRunStatusHistory_payrollRunId_idx" ON "PayrollRunStatusHistory"("payrollRunId");
CREATE INDEX "PayrollRunStatusHistory_createdAt_idx" ON "PayrollRunStatusHistory"("createdAt");
ALTER TABLE "PayrollRunStatusHistory" ADD CONSTRAINT "PayrollRunStatusHistory_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
