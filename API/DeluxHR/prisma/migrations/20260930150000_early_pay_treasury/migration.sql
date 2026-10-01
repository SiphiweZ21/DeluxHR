BEGIN;
-- CreateTable
CREATE TABLE "PlatformFundingAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "ownReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFundingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarlyPayPayoutBatch" (
    "id" TEXT NOT NULL,
    "fundingAccountId" TEXT NOT NULL,
    "fundingSnapshot" JSONB NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "preparedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submissionReference" TEXT,
    "submissionEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyPayPayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarlyPayPayoutItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "activeRequestId" TEXT,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "beneficiarySnapshot" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bankReference" TEXT,
    "resultEvidence" TEXT,
    "resultBy" TEXT,
    "resultAt" TIMESTAMP(3),

    CONSTRAINT "EarlyPayPayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EarlyPayPayoutBatch_status_createdAt_idx" ON "EarlyPayPayoutBatch"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayPayoutItem_activeRequestId_key" ON "EarlyPayPayoutItem"("activeRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayPayoutItem_paymentReference_key" ON "EarlyPayPayoutItem"("paymentReference");

-- CreateIndex
CREATE INDEX "EarlyPayPayoutItem_requestId_idx" ON "EarlyPayPayoutItem"("requestId");

-- CreateIndex
CREATE INDEX "EarlyPayPayoutItem_organizationId_idx" ON "EarlyPayPayoutItem"("organizationId");

-- CreateIndex
CREATE INDEX "EarlyPayPayoutItem_batchId_status_idx" ON "EarlyPayPayoutItem"("batchId", "status");

-- AddForeignKey
ALTER TABLE "EarlyPayPayoutBatch" ADD CONSTRAINT "EarlyPayPayoutBatch_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "PlatformFundingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayPayoutItem" ADD CONSTRAINT "EarlyPayPayoutItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EarlyPayPayoutBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayPayoutItem" ADD CONSTRAINT "EarlyPayPayoutItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EarlyPayRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep invalid amounts/transitions and unsafe allocation edits out of direct writes.
ALTER TABLE "PlatformFundingAccount" ADD CONSTRAINT "PlatformFundingAccount_status_check" CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED','RETIRED'));
ALTER TABLE "EarlyPayPayoutBatch" ADD CONSTRAINT "EarlyPayPayoutBatch_state_check" CHECK ("status" IN ('PREPARED','APPROVED','SUBMITTED','RECONCILED','CANCELLED') AND "currency"='ZAR' AND "totalCents">0);
ALTER TABLE "EarlyPayPayoutItem" ADD CONSTRAINT "EarlyPayPayoutItem_state_check" CHECK ("status" IN ('PENDING','PAID','FAILED','CANCELLED') AND "amountCents">0 AND (("activeRequestId" IS NOT NULL AND "activeRequestId"="requestId") OR ("activeRequestId" IS NULL AND "status"='CANCELLED')));
ALTER TABLE "PlatformFundingAccount" ADD CONSTRAINT "PlatformFundingAccount_checker_check" CHECK ("reviewedBy" IS NULL OR "reviewedBy"<>"createdBy");
ALTER TABLE "EarlyPayPayoutBatch" ADD CONSTRAINT "EarlyPayPayoutBatch_checker_check" CHECK ("approvedBy" IS NULL OR "approvedBy"<>"preparedBy");
ALTER TABLE "EarlyPayPayoutItem" ADD CONSTRAINT "EarlyPayPayoutItem_confirmation_check" CHECK ("status" NOT IN ('PAID','FAILED') OR ("resultBy" IS NOT NULL AND "resultAt" IS NOT NULL AND "bankReference" IS NOT NULL AND "resultEvidence" IS NOT NULL));
COMMIT;
