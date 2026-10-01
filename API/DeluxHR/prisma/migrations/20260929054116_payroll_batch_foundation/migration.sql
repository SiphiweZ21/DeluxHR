/*
  Warnings:

  - A unique constraint covering the columns `[payrollBatchId,employeeId]` on the table `PayrollRun` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PayrollBatchStatus" AS ENUM ('DRAFT', 'GENERATING', 'CALCULATED', 'REVIEWED', 'APPROVED', 'LOCKED', 'PAYMENT_PROCESSING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "payrollBatchId" TEXT;

-- CreateTable
CREATE TABLE "PayrollBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT,
    "payPeriodStart" TIMESTAMP(3) NOT NULL,
    "payPeriodEnd" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "PayrollBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "generationStartedByUserId" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "calculatedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "paymentProcessingByUserId" TEXT,
    "paymentProcessingAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollBatch_organizationId_idx" ON "PayrollBatch"("organizationId");

-- CreateIndex
CREATE INDEX "PayrollBatch_status_idx" ON "PayrollBatch"("status");

-- CreateIndex
CREATE INDEX "PayrollBatch_payPeriodStart_payPeriodEnd_idx" ON "PayrollBatch"("payPeriodStart", "payPeriodEnd");

-- CreateIndex
CREATE INDEX "PayrollBatch_paymentDate_idx" ON "PayrollBatch"("paymentDate");

-- CreateIndex
CREATE INDEX "PayrollBatch_createdAt_idx" ON "PayrollBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBatch_organizationId_payPeriodStart_payPeriodEnd_key" ON "PayrollBatch"("organizationId", "payPeriodStart", "payPeriodEnd");

-- CreateIndex
CREATE INDEX "PayrollRun_payrollBatchId_idx" ON "PayrollRun"("payrollBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_payrollBatchId_employeeId_key" ON "PayrollRun"("payrollBatchId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollBatch" ADD CONSTRAINT "PayrollBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollBatchId_fkey" FOREIGN KEY ("payrollBatchId") REFERENCES "PayrollBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
