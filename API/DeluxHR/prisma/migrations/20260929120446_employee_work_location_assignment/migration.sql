-- CreateTable
CREATE TABLE "EmployeeWorkLocationAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workLocationId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeWorkLocationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeWorkLocationAssignment_organizationId_idx" ON "EmployeeWorkLocationAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "EmployeeWorkLocationAssignment_employeeId_idx" ON "EmployeeWorkLocationAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkLocationAssignment_workLocationId_idx" ON "EmployeeWorkLocationAssignment"("workLocationId");

-- CreateIndex
CREATE INDEX "EmployeeWorkLocationAssignment_organizationId_employeeId_idx" ON "EmployeeWorkLocationAssignment"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkLocationAssignment_organizationId_workLocationI_idx" ON "EmployeeWorkLocationAssignment"("organizationId", "workLocationId");

-- CreateIndex
CREATE INDEX "EmployeeWorkLocationAssignment_employeeId_effectiveTo_idx" ON "EmployeeWorkLocationAssignment"("employeeId", "effectiveTo");

-- AddForeignKey
ALTER TABLE "EmployeeWorkLocationAssignment" ADD CONSTRAINT "EmployeeWorkLocationAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkLocationAssignment" ADD CONSTRAINT "EmployeeWorkLocationAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkLocationAssignment" ADD CONSTRAINT "EmployeeWorkLocationAssignment_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
