-- CreateEnum
CREATE TYPE "RiskEventType" AS ENUM ('DUPLICATE_IDENTITY', 'DUPLICATE_EMPLOYEE', 'SHARED_BANK_ACCOUNT', 'PAYMENT_DETAILS_CHANGED', 'SALARY_CHANGED', 'RAPID_EMPLOYEE_ACTIVATION', 'PAYROLL_ANOMALY', 'TERMINATED_EMPLOYEE_PAYROLL_ATTEMPT', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskEventStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT,
    "type" "RiskEventType" NOT NULL,
    "severity" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "RiskEventStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceEntity" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskEvent_organizationId_idx" ON "RiskEvent"("organizationId");

-- CreateIndex
CREATE INDEX "RiskEvent_employeeId_idx" ON "RiskEvent"("employeeId");

-- CreateIndex
CREATE INDEX "RiskEvent_organizationId_status_idx" ON "RiskEvent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RiskEvent_organizationId_severity_idx" ON "RiskEvent"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "RiskEvent_organizationId_type_idx" ON "RiskEvent"("organizationId", "type");

-- CreateIndex
CREATE INDEX "RiskEvent_organizationId_employeeId_idx" ON "RiskEvent"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "RiskEvent_sourceEntity_sourceEntityId_idx" ON "RiskEvent"("sourceEntity", "sourceEntityId");

-- CreateIndex
CREATE INDEX "RiskEvent_assignedToUserId_idx" ON "RiskEvent"("assignedToUserId");

-- CreateIndex
CREATE INDEX "RiskEvent_detectedAt_idx" ON "RiskEvent"("detectedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
