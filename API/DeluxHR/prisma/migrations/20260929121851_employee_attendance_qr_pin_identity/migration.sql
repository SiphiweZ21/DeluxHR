-- CreateTable
CREATE TABLE "EmployeeAttendanceIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "pinHash" TEXT,
    "qrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "pinChangedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAttendanceIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendanceIdentity_employeeId_key" ON "EmployeeAttendanceIdentity"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendanceIdentity_qrToken_key" ON "EmployeeAttendanceIdentity"("qrToken");

-- CreateIndex
CREATE INDEX "EmployeeAttendanceIdentity_organizationId_idx" ON "EmployeeAttendanceIdentity"("organizationId");

-- CreateIndex
CREATE INDEX "EmployeeAttendanceIdentity_organizationId_isActive_idx" ON "EmployeeAttendanceIdentity"("organizationId", "isActive");

-- AddForeignKey
ALTER TABLE "EmployeeAttendanceIdentity" ADD CONSTRAINT "EmployeeAttendanceIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendanceIdentity" ADD CONSTRAINT "EmployeeAttendanceIdentity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
