-- CreateEnum
CREATE TYPE "WorkLocationType" AS ENUM ('HEAD_OFFICE', 'BRANCH', 'CALL_CENTRE', 'WAREHOUSE', 'CLIENT_SITE', 'FIELD_SITE', 'OTHER');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "workLocationId" TEXT;

-- CreateTable
CREATE TABLE "WorkLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkLocationType" NOT NULL DEFAULT 'OTHER',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'South Africa',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofenceRadiusMeters" INTEGER,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "kioskEnabled" BOOLEAN NOT NULL DEFAULT false,
    "qrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappLocationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "offlineKioskEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkLocation_organizationId_idx" ON "WorkLocation"("organizationId");

-- CreateIndex
CREATE INDEX "WorkLocation_organizationId_type_idx" ON "WorkLocation"("organizationId", "type");

-- CreateIndex
CREATE INDEX "WorkLocation_organizationId_isActive_idx" ON "WorkLocation"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkLocation_organizationId_code_key" ON "WorkLocation"("organizationId", "code");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workLocationId_idx" ON "AttendanceRecord"("workLocationId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_workLocationId_idx" ON "AttendanceRecord"("organizationId", "workLocationId");

-- AddForeignKey
ALTER TABLE "WorkLocation" ADD CONSTRAINT "WorkLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
