-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OnboardingMode" AS ENUM ('SELF_SERVICE', 'ASSISTED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'South Africa',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'Africa/Johannesburg',
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "OrganizationOnboarding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "mode" "OnboardingMode" NOT NULL DEFAULT 'SELF_SERVICE',
    "companyProfileComplete" BOOLEAN NOT NULL DEFAULT false,
    "departmentsComplete" BOOLEAN NOT NULL DEFAULT false,
    "accessSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "assistanceRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationOnboarding_organizationId_key" ON "OrganizationOnboarding"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationOnboarding_status_idx" ON "OrganizationOnboarding"("status");

-- CreateIndex
CREATE INDEX "OrganizationOnboarding_mode_idx" ON "OrganizationOnboarding"("mode");

-- CreateIndex
CREATE INDEX "OrganizationOnboarding_assistanceRequested_idx" ON "OrganizationOnboarding"("assistanceRequested");

-- AddForeignKey
ALTER TABLE "OrganizationOnboarding" ADD CONSTRAINT "OrganizationOnboarding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
