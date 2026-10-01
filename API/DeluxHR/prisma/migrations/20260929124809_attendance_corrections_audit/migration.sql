-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sourceAttendanceEventId" TEXT NOT NULL,
    "correctedEventType" "AttendanceEventType" NOT NULL,
    "correctedCapturedAt" TIMESTAMP(3) NOT NULL,
    "correctedWorkLocationId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "correctedByUserId" TEXT NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceCorrection_sourceAttendanceEventId_key" ON "AttendanceCorrection"("sourceAttendanceEventId");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_organizationId_employeeId_correctedAt_idx" ON "AttendanceCorrection"("organizationId", "employeeId", "correctedAt");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_organizationId_correctedAt_idx" ON "AttendanceCorrection"("organizationId", "correctedAt");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_correctedWorkLocationId_idx" ON "AttendanceCorrection"("correctedWorkLocationId");

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_sourceAttendanceEventId_fkey" FOREIGN KEY ("sourceAttendanceEventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_correctedWorkLocationId_fkey" FOREIGN KEY ("correctedWorkLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
