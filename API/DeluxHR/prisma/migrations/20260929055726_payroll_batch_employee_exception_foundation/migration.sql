-- CreateEnum
CREATE TYPE "PayrollBatchEmployeeEligibilityStatus" AS ENUM ('READY', 'WARNING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PayrollBatchEmployeeProcessingStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "PayrollBatchEmployee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollBatchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "eligibilityStatus" "PayrollBatchEmployeeEligibilityStatus" NOT NULL,
    "processingStatus" "PayrollBatchEmployeeProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "eligibilityReasons" JSONB,
    "eligibilityWarnings" JSONB,
    "generationAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastGenerationAttemptAt" TIMESTAMP(3),
    "lastGenerationError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBatchEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBatchEmployee_payrollRunId_key" ON "PayrollBatchEmployee"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_organizationId_idx" ON "PayrollBatchEmployee"("organizationId");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_payrollBatchId_idx" ON "PayrollBatchEmployee"("payrollBatchId");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_employeeId_idx" ON "PayrollBatchEmployee"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_eligibilityStatus_idx" ON "PayrollBatchEmployee"("eligibilityStatus");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_processingStatus_idx" ON "PayrollBatchEmployee"("processingStatus");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_payrollBatchId_eligibilityStatus_idx" ON "PayrollBatchEmployee"("payrollBatchId", "eligibilityStatus");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_payrollBatchId_processingStatus_idx" ON "PayrollBatchEmployee"("payrollBatchId", "processingStatus");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_createdAt_idx" ON "PayrollBatchEmployee"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBatchEmployee_payrollBatchId_employeeId_key" ON "PayrollBatchEmployee"("payrollBatchId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_payrollBatchId_fkey" FOREIGN KEY ("payrollBatchId") REFERENCES "PayrollBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
