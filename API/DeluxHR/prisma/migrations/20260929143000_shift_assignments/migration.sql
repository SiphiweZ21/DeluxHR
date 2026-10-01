CREATE TABLE "ShiftAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "employeeId" TEXT,
  "departmentId" TEXT,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "assignedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShiftAssignment_target_check" CHECK (("employeeId" IS NULL) <> ("departmentId" IS NULL)),
  CONSTRAINT "ShiftAssignment_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);
CREATE INDEX "ShiftAssignment_organizationId_employeeId_effectiveFrom_idx" ON "ShiftAssignment"("organizationId", "employeeId", "effectiveFrom");
CREATE INDEX "ShiftAssignment_organizationId_departmentId_effectiveFrom_idx" ON "ShiftAssignment"("organizationId", "departmentId", "effectiveFrom");
CREATE INDEX "ShiftAssignment_shiftId_idx" ON "ShiftAssignment"("shiftId");
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ShiftDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
