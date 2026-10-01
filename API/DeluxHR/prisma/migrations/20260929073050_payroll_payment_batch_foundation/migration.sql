-- CreateEnum
CREATE TYPE "PayrollPaymentBatchStatus" AS ENUM ('PREPARED', 'EXPORTED', 'SUBMITTED_TO_BANK', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollPaymentItemStatus" AS ENUM ('PREPARED', 'EXPORTED', 'SUBMITTED_TO_BANK', 'PAID', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollPaymentMethod" AS ENUM ('BANK_FILE');

-- CreateTable
CREATE TABLE "PayrollPaymentBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollBatchId" TEXT NOT NULL,
    "method" "PayrollPaymentMethod" NOT NULL DEFAULT 'BANK_FILE',
    "status" "PayrollPaymentBatchStatus" NOT NULL DEFAULT 'PREPARED',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preparedByUserId" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exportedByUserId" TEXT,
    "exportedAt" TIMESTAMP(3),
    "exportReference" TEXT,
    "exportFileName" TEXT,
    "submittedToBankByUserId" TEXT,
    "submittedToBankAt" TIMESTAMP(3),
    "bankSubmissionReference" TEXT,
    "paidByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPaymentItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollPaymentBatchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeePaymentDetailId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "PayrollPaymentItemStatus" NOT NULL DEFAULT 'PREPARED',
    "paymentDestinationSnapshot" JSONB NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "submittedToBankAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeCompensationChangeId" TEXT,

    CONSTRAINT "PayrollPaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollPaymentBatch_organizationId_idx" ON "PayrollPaymentBatch"("organizationId");

-- CreateIndex
CREATE INDEX "PayrollPaymentBatch_payrollBatchId_idx" ON "PayrollPaymentBatch"("payrollBatchId");

-- CreateIndex
CREATE INDEX "PayrollPaymentBatch_status_idx" ON "PayrollPaymentBatch"("status");

-- CreateIndex
CREATE INDEX "PayrollPaymentBatch_preparedAt_idx" ON "PayrollPaymentBatch"("preparedAt");

-- CreateIndex
CREATE INDEX "PayrollPaymentBatch_createdAt_idx" ON "PayrollPaymentBatch"("createdAt");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_organizationId_idx" ON "PayrollPaymentItem"("organizationId");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_payrollPaymentBatchId_idx" ON "PayrollPaymentItem"("payrollPaymentBatchId");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_employeeId_idx" ON "PayrollPaymentItem"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_payrollRunId_idx" ON "PayrollPaymentItem"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_employeePaymentDetailId_idx" ON "PayrollPaymentItem"("employeePaymentDetailId");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_status_idx" ON "PayrollPaymentItem"("status");

-- CreateIndex
CREATE INDEX "PayrollPaymentItem_createdAt_idx" ON "PayrollPaymentItem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPaymentItem_payrollPaymentBatchId_payrollRunId_key" ON "PayrollPaymentItem"("payrollPaymentBatchId", "payrollRunId");

-- AddForeignKey
ALTER TABLE "PayrollPaymentBatch" ADD CONSTRAINT "PayrollPaymentBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentBatch" ADD CONSTRAINT "PayrollPaymentBatch_payrollBatchId_fkey" FOREIGN KEY ("payrollBatchId") REFERENCES "PayrollBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentItem" ADD CONSTRAINT "PayrollPaymentItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentItem" ADD CONSTRAINT "PayrollPaymentItem_payrollPaymentBatchId_fkey" FOREIGN KEY ("payrollPaymentBatchId") REFERENCES "PayrollPaymentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentItem" ADD CONSTRAINT "PayrollPaymentItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentItem" ADD CONSTRAINT "PayrollPaymentItem_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentItem" ADD CONSTRAINT "PayrollPaymentItem_employeePaymentDetailId_fkey" FOREIGN KEY ("employeePaymentDetailId") REFERENCES "EmployeePaymentDetail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPaymentItem" ADD CONSTRAINT "PayrollPaymentItem_employeeCompensationChangeId_fkey" FOREIGN KEY ("employeeCompensationChangeId") REFERENCES "EmployeeCompensationChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
