-- CreateEnum
CREATE TYPE "EmployeeCompensationChangeStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "EmployeeCompensationChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previousBasicSalary" DOUBLE PRECISION NOT NULL,
    "proposedBasicSalary" DOUBLE PRECISION NOT NULL,
    "previousPensionableSalary" DOUBLE PRECISION,
    "proposedPensionableSalary" DOUBLE PRECISION,
    "previousHourlyRate" DOUBLE PRECISION,
    "proposedHourlyRate" DOUBLE PRECISION,
    "status" "EmployeeCompensationChangeStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeCompensationChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_organizationId_idx" ON "EmployeeCompensationChange"("organizationId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_employeeId_idx" ON "EmployeeCompensationChange"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_organizationId_employeeId_idx" ON "EmployeeCompensationChange"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_organizationId_status_idx" ON "EmployeeCompensationChange"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_employeeId_status_idx" ON "EmployeeCompensationChange"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_requestedByUserId_idx" ON "EmployeeCompensationChange"("requestedByUserId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_approvedByUserId_idx" ON "EmployeeCompensationChange"("approvedByUserId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_requestedAt_idx" ON "EmployeeCompensationChange"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCompensationChange_employeeId_version_key" ON "EmployeeCompensationChange"("employeeId", "version");

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
