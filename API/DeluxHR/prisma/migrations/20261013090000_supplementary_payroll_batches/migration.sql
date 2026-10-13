-- Permit separate batches for additional employees in the same payroll period.
-- Existing batches, payroll runs, payslips and payment references are retained.
DROP INDEX "PayrollBatch_organizationId_payPeriodStart_payPeriodEnd_key";
CREATE INDEX "PayrollBatch_organizationId_payPeriodStart_payPeriodEnd_idx"
ON "PayrollBatch"("organizationId", "payPeriodStart", "payPeriodEnd");
