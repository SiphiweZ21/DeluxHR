-- CreateEnum
CREATE TYPE "OvertimeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "TimesheetStatus" ADD VALUE 'LOCKED';

-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "breakHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lockId" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "scheduledHours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TimesheetEntry" ADD COLUMN     "breakHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sourceAttendanceEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sourceAttendanceRecordId" TEXT;

-- CreateTable
CREATE TABLE "OvertimePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dailyThresholdMinutes" INTEGER NOT NULL DEFAULT 480,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "maxDailyOvertimeMinutes" INTEGER NOT NULL DEFAULT 360,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "requestedMinutes" INTEGER NOT NULL,
    "approvedMinutes" INTEGER,
    "status" "OvertimeApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetAdjustment" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "entryId" TEXT,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriodLock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedByUserId" TEXT NOT NULL,

    CONSTRAINT "PayrollPeriodLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OvertimePolicy_organizationId_key" ON "OvertimePolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OvertimeApproval_entryId_key" ON "OvertimeApproval"("entryId");

-- CreateIndex
CREATE INDEX "OvertimeApproval_organizationId_status_idx" ON "OvertimeApproval"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TimesheetAdjustment_timesheetId_createdAt_idx" ON "TimesheetAdjustment"("timesheetId", "createdAt");

-- CreateIndex
CREATE INDEX "PayrollPeriodLock_organizationId_periodStart_periodEnd_idx" ON "PayrollPeriodLock"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriodLock_organizationId_periodStart_periodEnd_key" ON "PayrollPeriodLock"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_organizationId_employeeId_periodStart_periodEnd_key" ON "Timesheet"("organizationId", "employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetEntry_timesheetId_workDate_key" ON "TimesheetEntry"("timesheetId", "workDate");

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_lockId_fkey" FOREIGN KEY ("lockId") REFERENCES "PayrollPeriodLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimePolicy" ADD CONSTRAINT "OvertimePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeApproval" ADD CONSTRAINT "OvertimeApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeApproval" ADD CONSTRAINT "OvertimeApproval_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeApproval" ADD CONSTRAINT "OvertimeApproval_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeApproval" ADD CONSTRAINT "OvertimeApproval_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TimesheetEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetAdjustment" ADD CONSTRAINT "TimesheetAdjustment_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriodLock" ADD CONSTRAINT "PayrollPeriodLock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the meaning of historical approved totals until entries are reviewed.
UPDATE "Timesheet" SET "regularHours" = "totalHours" WHERE "totalHours" > 0;
