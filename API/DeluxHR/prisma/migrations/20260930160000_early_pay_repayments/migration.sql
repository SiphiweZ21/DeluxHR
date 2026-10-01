BEGIN;
-- CreateTable
CREATE TABLE "EarlyPayRepaymentDestination" (
    "id" TEXT NOT NULL DEFAULT 'DEFAULT',
    "accountId" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyPayRepaymentDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarlyPayRepaymentBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fundingProfileId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "fundingSnapshot" JSONB NOT NULL,
    "destinationSnapshot" JSONB NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentReference" TEXT NOT NULL,
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

    CONSTRAINT "EarlyPayRepaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarlyPayRepaymentItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "activeLedgerEntryId" TEXT,
    "activeRequestId" TEXT,
    "employeeName" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EarlyPayRepaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarlyPayRepaymentReceipt" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "bankReference" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyPayRepaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayRepaymentBatch_paymentReference_key" ON "EarlyPayRepaymentBatch"("paymentReference");

-- CreateIndex
CREATE INDEX "EarlyPayRepaymentBatch_organizationId_period_idx" ON "EarlyPayRepaymentBatch"("organizationId", "period");

-- CreateIndex
CREATE INDEX "EarlyPayRepaymentBatch_status_createdAt_idx" ON "EarlyPayRepaymentBatch"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayRepaymentBatch_organizationId_destinationAccountId__key" ON "EarlyPayRepaymentBatch"("organizationId", "destinationAccountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayRepaymentItem_activeLedgerEntryId_key" ON "EarlyPayRepaymentItem"("activeLedgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayRepaymentItem_activeRequestId_key" ON "EarlyPayRepaymentItem"("activeRequestId");

-- CreateIndex
CREATE INDEX "EarlyPayRepaymentItem_batchId_idx" ON "EarlyPayRepaymentItem"("batchId");

-- CreateIndex
CREATE INDEX "EarlyPayRepaymentReceipt_batchId_status_idx" ON "EarlyPayRepaymentReceipt"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyPayRepaymentReceipt_destinationAccountId_bankReference_key" ON "EarlyPayRepaymentReceipt"("destinationAccountId", "bankReference");

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentDestination" ADD CONSTRAINT "EarlyPayRepaymentDestination_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlatformFundingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentBatch" ADD CONSTRAINT "EarlyPayRepaymentBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentBatch" ADD CONSTRAINT "EarlyPayRepaymentBatch_organizationId_fundingProfileId_fkey" FOREIGN KEY ("organizationId", "fundingProfileId") REFERENCES "CompanyBankingProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentBatch" ADD CONSTRAINT "EarlyPayRepaymentBatch_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "PlatformFundingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentItem" ADD CONSTRAINT "EarlyPayRepaymentItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EarlyPayRepaymentBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentItem" ADD CONSTRAINT "EarlyPayRepaymentItem_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "PayrollLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentItem" ADD CONSTRAINT "EarlyPayRepaymentItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EarlyPayRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentReceipt" ADD CONSTRAINT "EarlyPayRepaymentReceipt_organizationId_destinationAccount_fkey" FOREIGN KEY ("organizationId", "destinationAccountId", "batchId") REFERENCES "EarlyPayRepaymentBatch"("organizationId", "destinationAccountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyPayRepaymentReceipt" ADD CONSTRAINT "EarlyPayRepaymentReceipt_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "PlatformFundingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EarlyPayRepaymentDestination" ADD CONSTRAINT "EarlyPayRepaymentDestination_singleton_check" CHECK ("id"='DEFAULT');
ALTER TABLE "EarlyPayRepaymentBatch" ADD CONSTRAINT "EarlyPayRepaymentBatch_state_check" CHECK ("status" IN ('PREPARED','APPROVED','SUBMITTED','PARTIALLY_REPAID','REPAID','CANCELLED') AND "totalCents">0);
ALTER TABLE "EarlyPayRepaymentBatch" ADD CONSTRAINT "EarlyPayRepaymentBatch_checker_check" CHECK ("approvedBy" IS NULL OR "approvedBy"<>"preparedBy");
ALTER TABLE "EarlyPayRepaymentItem" ADD CONSTRAINT "EarlyPayRepaymentItem_amount_check" CHECK ("amountCents">0 AND "principalCents">=0 AND "feeCents">=0 AND "amountCents"::bigint="principalCents"::bigint+"feeCents"::bigint);
ALTER TABLE "EarlyPayRepaymentItem" ADD CONSTRAINT "EarlyPayRepaymentItem_allocation_check" CHECK (("cancelled" AND "activeLedgerEntryId" IS NULL AND "activeRequestId" IS NULL) OR (NOT "cancelled" AND "activeLedgerEntryId" IS NOT NULL AND "activeRequestId" IS NOT NULL AND "activeLedgerEntryId"="ledgerEntryId" AND "activeRequestId"="requestId"));
ALTER TABLE "EarlyPayRepaymentReceipt" ADD CONSTRAINT "EarlyPayRepaymentReceipt_state_check" CHECK ("amountCents">0 AND "status" IN ('RECORDED','CONFIRMED','VOIDED'));
ALTER TABLE "EarlyPayRepaymentReceipt" ADD CONSTRAINT "EarlyPayRepaymentReceipt_checker_check" CHECK ("decidedBy" IS NULL OR "decidedBy"<>"recordedBy");
ALTER TABLE "EarlyPayRepaymentReceipt" ADD CONSTRAINT "EarlyPayRepaymentReceipt_decision_check" CHECK ("status"='RECORDED' OR ("decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionReason" IS NOT NULL));
COMMIT;
