-- CreateTable
CREATE TABLE "AttendanceKiosk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workLocationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceKiosk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceKiosk_organizationId_idx" ON "AttendanceKiosk"("organizationId");

-- CreateIndex
CREATE INDEX "AttendanceKiosk_workLocationId_idx" ON "AttendanceKiosk"("workLocationId");

-- CreateIndex
CREATE INDEX "AttendanceKiosk_organizationId_isActive_idx" ON "AttendanceKiosk"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceKiosk_organizationId_deviceCode_key" ON "AttendanceKiosk"("organizationId", "deviceCode");

-- AddForeignKey
ALTER TABLE "AttendanceKiosk" ADD CONSTRAINT "AttendanceKiosk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceKiosk" ADD CONSTRAINT "AttendanceKiosk_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
