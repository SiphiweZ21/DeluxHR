ALTER TYPE "AttendanceExceptionType" ADD VALUE 'LATE_ARRIVAL';
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'EARLY_DEPARTURE';
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'EXPECTED_ABSENCE';
ALTER TABLE "AttendanceException" ADD COLUMN "scheduledDate" DATE, ADD COLUMN "employeeExplanation" TEXT, ADD COLUMN "explainedAt" TIMESTAMP(3), ADD COLUMN "explainedByUserId" TEXT;
CREATE UNIQUE INDEX "AttendanceException_organizationId_employeeId_scheduledDate_type_key" ON "AttendanceException"("organizationId", "employeeId", "scheduledDate", "type");
CREATE TABLE "RecurringSchedule" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "shiftId" TEXT NOT NULL,
 "employeeId" TEXT, "departmentId" TEXT, "workLocationId" TEXT,
 "weekdays" INTEGER[] NOT NULL, "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
 "graceInMinutes" INTEGER NOT NULL DEFAULT 0, "graceOutMinutes" INTEGER NOT NULL DEFAULT 0,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RecurringSchedule_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "RecurringSchedule_target_check" CHECK (("employeeId" IS NULL) <> ("departmentId" IS NULL)),
 CONSTRAINT "RecurringSchedule_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
 CONSTRAINT "RecurringSchedule_weekdays_check" CHECK (array_length("weekdays", 1) BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]),
 CONSTRAINT "RecurringSchedule_grace_check" CHECK ("graceInMinutes" BETWEEN 0 AND 240 AND "graceOutMinutes" BETWEEN 0 AND 240)
);
CREATE INDEX "RecurringSchedule_organizationId_employeeId_effectiveFrom_idx" ON "RecurringSchedule"("organizationId", "employeeId", "effectiveFrom");
CREATE INDEX "RecurringSchedule_organizationId_departmentId_effectiveFrom_idx" ON "RecurringSchedule"("organizationId", "departmentId", "effectiveFrom");
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ShiftDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
