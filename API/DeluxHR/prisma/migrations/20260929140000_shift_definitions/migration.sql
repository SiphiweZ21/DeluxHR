CREATE TABLE "ShiftDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "unpaidBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftDefinition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShiftDefinition_startMinute_check" CHECK ("startMinute" BETWEEN 0 AND 1439),
    CONSTRAINT "ShiftDefinition_endMinute_check" CHECK ("endMinute" BETWEEN 0 AND 1439),
    CONSTRAINT "ShiftDefinition_break_check" CHECK ("unpaidBreakMinutes" BETWEEN 0 AND 1439)
);
CREATE UNIQUE INDEX "ShiftDefinition_organizationId_code_key" ON "ShiftDefinition"("organizationId", "code");
CREATE INDEX "ShiftDefinition_organizationId_isActive_idx" ON "ShiftDefinition"("organizationId", "isActive");
ALTER TABLE "ShiftDefinition" ADD CONSTRAINT "ShiftDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
