BEGIN;
-- AlterTable
ALTER TABLE "PayrollRemittancePayment" ADD COLUMN     "batchAllocationId" TEXT;

-- CreateTable
CREATE TABLE "RemittanceBeneficiary" (
    "payeeReference" TEXT,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "code" TEXT,
    "creditorName" TEXT,
    "uifViaSars" BOOLEAN,
    "registrationEvidence" TEXT,
    "bankName" TEXT,
    "accountHolder" TEXT,
    "accountNumber" TEXT,
    "branchCode" TEXT,
    "accountType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittanceBeneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittancePaymentBatch" (
    "resultPaidAt" TIMESTAMP(3),
    "actualPaidCents" INTEGER,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "fundingProfileId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "fundingSnapshot" JSONB NOT NULL,
    "beneficiarySnapshot" JSONB NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "declarationEvidence" TEXT,
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "preparedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submissionReference" TEXT,
    "submissionEvidence" TEXT,
    "resultReference" TEXT,
    "resultEvidence" TEXT,
    "resultBy" TEXT,
    "resultAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittancePaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceBatchAllocation" (
    "organizationId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "RemittanceBatchAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemittanceBeneficiary_organizationId_status_idx" ON "RemittanceBeneficiary"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceBeneficiary_organizationId_id_key" ON "RemittanceBeneficiary"("organizationId", "id");

-- CreateIndex
CREATE INDEX "RemittancePaymentBatch_organizationId_period_status_idx" ON "RemittancePaymentBatch"("organizationId", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RemittancePaymentBatch_organizationId_resultReference_key" ON "RemittancePaymentBatch"("organizationId", "resultReference");

-- CreateIndex
CREATE UNIQUE INDEX "RemittancePaymentBatch_organizationId_id_key" ON "RemittancePaymentBatch"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceBatchAllocation_organizationId_id_key" ON "RemittanceBatchAllocation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceBatchAllocation_batchId_code_creditorName_key" ON "RemittanceBatchAllocation"("batchId", "code", "creditorName");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRemittancePayment_batchAllocationId_key" ON "PayrollRemittancePayment"("batchAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRemittancePayment_organizationId_batchAllocationId_key" ON "PayrollRemittancePayment"("organizationId", "batchAllocationId");

-- AddForeignKey
ALTER TABLE "PayrollRemittancePayment" ADD CONSTRAINT "PayrollRemittancePayment_organizationId_batchAllocationId_fkey" FOREIGN KEY ("organizationId", "batchAllocationId") REFERENCES "RemittanceBatchAllocation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceBeneficiary" ADD CONSTRAINT "RemittanceBeneficiary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_organizationId_beneficiaryId_fkey" FOREIGN KEY ("organizationId", "beneficiaryId") REFERENCES "RemittanceBeneficiary"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_organizationId_fundingProfileId_fkey" FOREIGN KEY ("organizationId", "fundingProfileId") REFERENCES "CompanyBankingProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceBatchAllocation" ADD CONSTRAINT "RemittanceBatchAllocation_organizationId_batchId_fkey" FOREIGN KEY ("organizationId", "batchId") REFERENCES "RemittancePaymentBatch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RemittanceBeneficiary" ADD CONSTRAINT "RemittanceBeneficiary_route_check"
 CHECK ("route" IN ('BANK_TRANSFER','SARS_EFILING','UIF_PORTAL'));
ALTER TABLE "RemittanceBeneficiary" ADD CONSTRAINT "RemittanceBeneficiary_status_check"
 CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED','RETIRED'));
ALTER TABLE "RemittanceBeneficiary" ADD CONSTRAINT "RemittanceBeneficiary_reviewer_check"
 CHECK ("status" NOT IN ('APPROVED','REJECTED','RETIRED') OR
   ("reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewedBy" <> "createdBy"));
ALTER TABLE "RemittanceBeneficiary" ADD CONSTRAINT "RemittanceBeneficiary_ordinary_check"
 CHECK ("route" <> 'BANK_TRANSFER' OR ("code" IS NOT NULL AND "creditorName" IS NOT NULL
 AND "code" NOT IN ('PAYE','SDL_EMPLOYER','UIF_EMPLOYEE','UIF_EMPLOYER','EARLY_PAY_RECOVERY')
 AND "accountNumber" IS NOT NULL AND "accountNumber" ~ '^[0-9]{6,20}$'
 AND "branchCode" IS NOT NULL AND "branchCode" ~ '^[0-9]{6}$'
 AND "accountHolder" IS NOT NULL AND "bankName" IS NOT NULL
 AND "accountType" IS NOT NULL AND "accountType" IN ('CURRENT','SAVINGS','TRANSMISSION')
 AND "payeeReference" IS NOT NULL AND "payeeReference" ~ '^[A-Za-z0-9 /-]{1,20}$'));
ALTER TABLE "RemittanceBeneficiary" ADD CONSTRAINT "RemittanceBeneficiary_statutory_check"
 CHECK ("route" = 'BANK_TRANSFER' OR ("accountNumber" IS NULL AND "branchCode" IS NULL
 AND "accountHolder" IS NULL AND "bankName" IS NULL AND "accountType" IS NULL
 AND "code" IS NULL AND "creditorName" IS NULL AND "payeeReference" IS NULL
 AND "registrationEvidence" IS NOT NULL AND length(trim("registrationEvidence")) >= 10
 AND "uifViaSars" IS NOT NULL AND ("route" <> 'UIF_PORTAL' OR NOT "uifViaSars")));
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_value_check"
 CHECK ("totalCents" BETWEEN 1 AND 1000000000 AND "period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
 AND "route" IN ('BANK_TRANSFER','SARS_EFILING','UIF_PORTAL')
 AND "status" IN ('PREPARED','APPROVED','SUBMITTED','PAID','FAILED','EXCEPTION','CANCELLED')
 AND ("actualPaidCents" IS NULL OR "actualPaidCents" BETWEEN 0 AND 1000000000));
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_release_check"
 CHECK ("status" NOT IN ('APPROVED','SUBMITTED','PAID','FAILED','EXCEPTION') OR
 ("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedBy" <> "preparedBy"));
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_result_check"
 CHECK ("status" NOT IN ('PAID','FAILED','EXCEPTION') OR
 ("submittedBy" IS NOT NULL AND "submittedAt" IS NOT NULL AND "resultBy" IS NOT NULL
 AND "resultBy" <> "preparedBy" AND "resultBy" <> "submittedBy"
 AND "resultPaidAt" IS NOT NULL AND "resultAt" IS NOT NULL AND "resultReference" IS NOT NULL AND "resultEvidence" IS NOT NULL
 AND "actualPaidCents" IS NOT NULL AND ("status" <> 'PAID' OR "actualPaidCents"="totalCents")
 AND ("status" <> 'FAILED' OR "actualPaidCents"=0)));
ALTER TABLE "RemittancePaymentBatch" ADD CONSTRAINT "RemittancePaymentBatch_statutory_reference_check"
 CHECK ("route" = 'BANK_TRANSFER' OR ("declarationEvidence" IS NOT NULL
 AND length(trim("declarationEvidence")) >= 10 AND
 ("route" <> 'SARS_EFILING' OR "paymentReference" ~ '^[0-9]{19}$')));
ALTER TABLE "RemittanceBatchAllocation" ADD CONSTRAINT "RemittanceBatchAllocation_amount_check"
 CHECK ("amountCents" BETWEEN 1 AND 1000000000 AND "code" <> 'EARLY_PAY_RECOVERY');
COMMIT;
