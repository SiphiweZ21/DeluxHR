CREATE TYPE "EarlyPayRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'RECOVERED');
CREATE TYPE "EarlyPayTransferType" AS ENUM ('STANDARD', 'INSTANT');

CREATE TABLE "EarlyPayPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "minimumQualifyingDays" INTEGER NOT NULL DEFAULT 5,
  "accessibleNetPercentage" DOUBLE PRECISION NOT NULL DEFAULT 40,
  "minimumRequestAmount" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "maximumRequestAmount" DOUBLE PRECISION NOT NULL DEFAULT 2000,
  "maximumRequestsPerPeriod" INTEGER NOT NULL DEFAULT 2,
  "paydayDay" INTEGER NOT NULL DEFAULT 25,
  "paydayCutoffDays" INTEGER NOT NULL DEFAULT 3,
  "estimatedPayeReserveRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
  "estimatedUifReserveRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "protectedDeductionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "serviceFee" DOUBLE PRECISION NOT NULL DEFAULT 25,
  "standardTransferFee" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "instantTransferFee" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EarlyPayPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EarlyPayPolicy_organizationId_key" ON "EarlyPayPolicy"("organizationId");

CREATE TABLE "EarlyPayRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payrollRunId" TEXT,
  "payPeriodStart" TIMESTAMP(3) NOT NULL,
  "payPeriodEnd" TIMESTAMP(3) NOT NULL,
  "qualifyingDays" DOUBLE PRECISION NOT NULL,
  "grossEarnedAtRequest" DOUBLE PRECISION NOT NULL,
  "estimatedPaye" DOUBLE PRECISION NOT NULL,
  "estimatedUif" DOUBLE PRECISION NOT NULL,
  "protectedDeductions" DOUBLE PRECISION NOT NULL,
  "estimatedNetEarned" DOUBLE PRECISION NOT NULL,
  "accessiblePercentage" DOUBLE PRECISION NOT NULL,
  "availableAmountAtRequest" DOUBLE PRECISION NOT NULL,
  "requestedAmount" DOUBLE PRECISION NOT NULL,
  "serviceFee" DOUBLE PRECISION NOT NULL,
  "transferFee" DOUBLE PRECISION NOT NULL,
  "instantFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netDisbursement" DOUBLE PRECISION NOT NULL,
  "totalPayrollRecovery" DOUBLE PRECISION NOT NULL,
  "transferType" "EarlyPayTransferType" NOT NULL DEFAULT 'STANDARD',
  "status" "EarlyPayRequestStatus" NOT NULL DEFAULT 'PENDING',
  "calculationSnapshot" JSONB NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "recoveredAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "paymentReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EarlyPayRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EarlyPayRequest_organizationId_idx" ON "EarlyPayRequest"("organizationId");
CREATE INDEX "EarlyPayRequest_employeeId_idx" ON "EarlyPayRequest"("employeeId");
CREATE INDEX "EarlyPayRequest_status_idx" ON "EarlyPayRequest"("status");
CREATE INDEX "EarlyPayRequest_payPeriodStart_payPeriodEnd_idx" ON "EarlyPayRequest"("payPeriodStart", "payPeriodEnd");
ALTER TABLE "EarlyPayPolicy" ADD CONSTRAINT "EarlyPayPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarlyPayRequest" ADD CONSTRAINT "EarlyPayRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarlyPayRequest" ADD CONSTRAINT "EarlyPayRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarlyPayRequest" ADD CONSTRAINT "EarlyPayRequest_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
