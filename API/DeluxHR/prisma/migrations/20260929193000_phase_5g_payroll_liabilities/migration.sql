-- CreateTable
CREATE TABLE "PayrollLiabilityAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLiabilityAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRemittancePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRemittancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollLiabilityAdjustment_organizationId_period_code_credi_idx" ON "PayrollLiabilityAdjustment"("organizationId", "period", "code", "creditorName");

-- CreateIndex
CREATE INDEX "PayrollRemittancePayment_organizationId_period_code_credito_idx" ON "PayrollRemittancePayment"("organizationId", "period", "code", "creditorName");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRemittancePayment_organizationId_reference_key" ON "PayrollRemittancePayment"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "PayrollLiabilityAdjustment" ADD CONSTRAINT "PayrollLiabilityAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRemittancePayment" ADD CONSTRAINT "PayrollRemittancePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
