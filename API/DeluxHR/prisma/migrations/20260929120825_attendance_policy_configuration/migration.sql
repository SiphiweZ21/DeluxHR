-- CreateEnum
CREATE TYPE "AttendanceChannel" AS ENUM ('WEB', 'KIOSK', 'QR', 'WHATSAPP', 'SUPERVISOR');

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workLocationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attendanceRequired" BOOLEAN NOT NULL DEFAULT true,
    "checkInRequired" BOOLEAN NOT NULL DEFAULT true,
    "checkOutRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowedChannels" "AttendanceChannel"[],
    "locationVerificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "offlineKioskAllowed" BOOLEAN NOT NULL DEFAULT false,
    "supervisorFallbackAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendancePolicy_organizationId_idx" ON "AttendancePolicy"("organizationId");

-- CreateIndex
CREATE INDEX "AttendancePolicy_organizationId_isActive_idx" ON "AttendancePolicy"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "AttendancePolicy_workLocationId_idx" ON "AttendancePolicy"("workLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePolicy_organizationId_workLocationId_name_key" ON "AttendancePolicy"("organizationId", "workLocationId", "name");

-- AddForeignKey
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
