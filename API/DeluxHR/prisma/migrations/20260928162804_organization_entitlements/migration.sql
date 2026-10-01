-- CreateEnum
CREATE TYPE "Feature" AS ENUM ('CORE_HR', 'LEAVE', 'ATTENDANCE', 'TIMESHEETS', 'PAYROLL', 'PAYSLIPS', 'WHATSAPP', 'EARLY_PAY', 'WORKFORCE_INSIGHTS', 'EXECUTIVE_DASHBOARD');

-- CreateTable
CREATE TABLE "OrganizationFeature" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" "Feature" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationFeature_organizationId_idx" ON "OrganizationFeature"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationFeature_feature_idx" ON "OrganizationFeature"("feature");

-- CreateIndex
CREATE INDEX "OrganizationFeature_enabled_idx" ON "OrganizationFeature"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFeature_organizationId_feature_key" ON "OrganizationFeature"("organizationId", "feature");

-- AddForeignKey
ALTER TABLE "OrganizationFeature" ADD CONSTRAINT "OrganizationFeature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
