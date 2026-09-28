CREATE TYPE "PayrollLedgerCategory" AS ENUM ('EARNING', 'STATUTORY_DEDUCTION', 'BENEFIT_DEDUCTION', 'OTHER_DEDUCTION', 'EARLY_PAY_RECOVERY', 'EMPLOYER_CONTRIBUTION', 'EMPLOYER_STATUTORY', 'NET_PAY');
CREATE TYPE "PayrollLedgerEffect" AS ENUM ('EMPLOYEE_EARNING', 'EMPLOYEE_DEDUCTION', 'EMPLOYER_COST', 'EMPLOYER_LIABILITY', 'NET_SETTLEMENT');

CREATE TABLE "PayrollLedgerEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "category" "PayrollLedgerCategory" NOT NULL,
  "effect" "PayrollLedgerEffect" NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ZAR',
  "creditorName" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollLedgerEntry_payrollRunId_sequence_key" ON "PayrollLedgerEntry"("payrollRunId", "sequence");
CREATE INDEX "PayrollLedgerEntry_organizationId_idx" ON "PayrollLedgerEntry"("organizationId");
CREATE INDEX "PayrollLedgerEntry_employeeId_idx" ON "PayrollLedgerEntry"("employeeId");
CREATE INDEX "PayrollLedgerEntry_payrollRunId_idx" ON "PayrollLedgerEntry"("payrollRunId");
CREATE INDEX "PayrollLedgerEntry_category_idx" ON "PayrollLedgerEntry"("category");
CREATE INDEX "PayrollLedgerEntry_effect_idx" ON "PayrollLedgerEntry"("effect");
ALTER TABLE "PayrollLedgerEntry" ADD CONSTRAINT "PayrollLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollLedgerEntry" ADD CONSTRAINT "PayrollLedgerEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollLedgerEntry" ADD CONSTRAINT "PayrollLedgerEntry_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
