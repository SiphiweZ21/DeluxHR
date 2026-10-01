-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "brandPrimaryColor" TEXT,
ADD COLUMN     "logoStorageKey" TEXT;

-- CreateTable
CREATE TABLE "OnboardingConfirmation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "confirmedByUserId" TEXT NOT NULL,
    "note" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingConfirmation_organizationId_step_key" ON "OnboardingConfirmation"("organizationId", "step");

-- AddForeignKey
ALTER TABLE "OnboardingConfirmation" ADD CONSTRAINT "OnboardingConfirmation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
