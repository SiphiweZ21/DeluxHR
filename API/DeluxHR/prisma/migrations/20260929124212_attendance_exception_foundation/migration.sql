-- CreateEnum
CREATE TYPE "AttendanceExceptionType" AS ENUM ('MISSING_CHECK_IN', 'MISSING_CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "AttendanceException" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workLocationId" TEXT,
    "type" "AttendanceExceptionType" NOT NULL,
    "status" "AttendanceExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "sourceAttendanceEventId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedBy" TIMESTAMP(3),
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceException_organizationId_status_type_idx" ON "AttendanceException"("organizationId", "status", "type");

-- CreateIndex
CREATE INDEX "AttendanceException_organizationId_employeeId_status_idx" ON "AttendanceException"("organizationId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "AttendanceException_workLocationId_idx" ON "AttendanceException"("workLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceException_organizationId_type_sourceAttendanceEve_key" ON "AttendanceException"("organizationId", "type", "sourceAttendanceEventId");

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
