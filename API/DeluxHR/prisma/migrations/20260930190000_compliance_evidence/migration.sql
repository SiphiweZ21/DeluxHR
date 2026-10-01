BEGIN;
ALTER TABLE "CompanyOnboardingDocument"
 ADD COLUMN "referenceNumber" TEXT,
 ADD COLUMN "issuedAt" DATE,
 ADD COLUMN "expiresAt" DATE,
 ADD COLUMN "employeeId" TEXT,
 ADD COLUMN "officerGrade" TEXT,
 ADD COLUMN "assessmentAmount" DECIMAL(14,2),
 ADD COLUMN "assessmentPeriod" TEXT;
ALTER TABLE "CompanyOnboardingDocument" ADD CONSTRAINT "company_document_dates" CHECK ("expiresAt" IS NULL OR "issuedAt" IS NULL OR "expiresAt" >= "issuedAt"), ADD CONSTRAINT "company_document_amount" CHECK ("assessmentAmount" IS NULL OR "assessmentAmount" >= 0);
CREATE UNIQUE INDEX "Employee_organizationId_id_key" ON "Employee"("organizationId","id");
ALTER TABLE "CompanyOnboardingDocument" ADD CONSTRAINT "CompanyOnboardingDocument_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyOnboardingDocument" ADD COLUMN "liabilityPeriod" TEXT;
CREATE UNIQUE INDEX "company_assessment_verified_reference" ON "CompanyOnboardingDocument" ("organizationId", "category", "referenceNumber", "assessmentPeriod") WHERE "status" = 'VERIFIED' AND "category" IN ('COIDA_ASSESSMENT','PSIRA_FEE_ASSESSMENT');
ALTER TABLE "CompanyOnboardingDocument" ADD CONSTRAINT "company_assessment_metadata" CHECK ("category" NOT IN ('COIDA_ASSESSMENT','PSIRA_FEE_ASSESSMENT') OR ("referenceNumber" IS NOT NULL AND "assessmentPeriod" IS NOT NULL AND "liabilityPeriod" IS NOT NULL AND "liabilityPeriod" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' AND "assessmentAmount" IS NOT NULL AND "assessmentAmount" <= 10000000));
ALTER TABLE "CompanyOnboardingDocument" DROP CONSTRAINT "CompanyOnboardingDocument_check";
ALTER TABLE "CompanyOnboardingDocument" ADD CONSTRAINT "CompanyOnboardingDocument_check" CHECK (
 "category" IN ('REGISTRATION','TAX_REGISTRATION','ADDRESS_PROOF','OTHER','COIDA_REGISTRATION','COIDA_GOOD_STANDING','COIDA_ASSESSMENT','PSIRA_BUSINESS_REGISTRATION','PSIRA_GOOD_STANDING','PSIRA_EMPLOYEE_REGISTRATION','PSIRA_FEE_ASSESSMENT')
 AND "status" IN ('PENDING_VERIFICATION','VERIFIED','REJECTED')
 AND "fileSizeBytes" BETWEEN 1 AND 10485760 AND "mimeType" IN ('application/pdf','image/jpeg','image/png')
 AND ("status"='PENDING_VERIFICATION' OR ("reviewedBy" IS NOT NULL AND "reviewedBy"<>"uploadedBy" AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason"))>=3)));
COMMIT;
