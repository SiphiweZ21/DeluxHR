-- CreateEnum
CREATE TYPE "CompanyBankingProfileStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CompanyPaymentPurpose" AS ENUM ('SALARIES', 'LIABILITIES', 'EARLY_PAY_REPAYMENT');

-- CreateTable
CREATE TABLE "CompanyBankingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ZA',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "accountHolder" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "originatorId" TEXT,
    "ownReference" TEXT NOT NULL,
    "status" "CompanyBankingProfileStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "retiredByUserId" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyBankingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBankingDefault" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" "CompanyPaymentPurpose" NOT NULL,
    "profileId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyBankingDefault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyBankingProfile_organizationId_status_idx" ON "CompanyBankingProfile"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBankingProfile_organizationId_id_key" ON "CompanyBankingProfile"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBankingDefault_organizationId_purpose_key" ON "CompanyBankingDefault"("organizationId", "purpose");

-- AddForeignKey
ALTER TABLE "CompanyBankingProfile" ADD CONSTRAINT "CompanyBankingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBankingDefault" ADD CONSTRAINT "CompanyBankingDefault_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBankingDefault" ADD CONSTRAINT "CompanyBankingDefault_organizationId_profileId_fkey" FOREIGN KEY ("organizationId", "profileId") REFERENCES "CompanyBankingProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

