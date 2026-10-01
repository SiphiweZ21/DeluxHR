-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceEventSyncStatus" AS ENUM ('RECEIVED', 'SYNCED_OFFLINE');

-- CreateTable
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workLocationId" TEXT,
    "eventType" "AttendanceEventType" NOT NULL,
    "channel" "AttendanceChannel" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "syncStatus" "AttendanceEventSyncStatus" NOT NULL DEFAULT 'RECEIVED',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationAccuracyM" DOUBLE PRECISION,
    "sourceReference" TEXT,
    "deviceReference" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceEvent_organizationId_idx" ON "AttendanceEvent"("organizationId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_employeeId_idx" ON "AttendanceEvent"("employeeId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_workLocationId_idx" ON "AttendanceEvent"("workLocationId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_organizationId_employeeId_capturedAt_idx" ON "AttendanceEvent"("organizationId", "employeeId", "capturedAt");

-- CreateIndex
CREATE INDEX "AttendanceEvent_organizationId_workLocationId_capturedAt_idx" ON "AttendanceEvent"("organizationId", "workLocationId", "capturedAt");

-- CreateIndex
CREATE INDEX "AttendanceEvent_capturedAt_idx" ON "AttendanceEvent"("capturedAt");

-- CreateIndex
CREATE INDEX "AttendanceEvent_channel_idx" ON "AttendanceEvent"("channel");

-- CreateIndex
CREATE INDEX "AttendanceEvent_syncStatus_idx" ON "AttendanceEvent"("syncStatus");

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
