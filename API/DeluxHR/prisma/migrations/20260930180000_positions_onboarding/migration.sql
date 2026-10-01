BEGIN;
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "positionId" TEXT;

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyOnboardingDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "uploadedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyOnboardingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_organizationId_isActive_idx" ON "Position"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Position_organizationId_departmentId_id_key" ON "Position"("organizationId", "departmentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Position_organizationId_departmentId_code_key" ON "Position"("organizationId", "departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Position_organizationId_departmentId_name_key" ON "Position"("organizationId", "departmentId", "name");

-- CreateIndex
CREATE INDEX "CompanyOnboardingDocument_organizationId_createdAt_idx" ON "CompanyOnboardingDocument"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_id_key" ON "Department"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_departmentId_positionId_fkey" FOREIGN KEY ("organizationId", "departmentId", "positionId") REFERENCES "Position"("organizationId", "departmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOnboardingDocument" ADD CONSTRAINT "CompanyOnboardingDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Position" ADD CONSTRAINT "Position_name_code_check" CHECK (length(trim("name")) BETWEEN 1 AND 120 AND length(trim("code")) BETWEEN 1 AND 40);
ALTER TABLE "CompanyOnboardingDocument" ADD CONSTRAINT "CompanyOnboardingDocument_check" CHECK (
 "category" IN ('REGISTRATION','TAX_REGISTRATION','ADDRESS_PROOF','OTHER') AND "status" IN ('PENDING_VERIFICATION','VERIFIED','REJECTED')
 AND "fileSizeBytes" BETWEEN 1 AND 10485760 AND "mimeType" IN ('application/pdf','image/jpeg','image/png')
 AND ("status"='PENDING_VERIFICATION' OR ("reviewedBy" IS NOT NULL AND "reviewedBy"<>"uploadedBy" AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason"))>=3)));
CREATE UNIQUE INDEX "Position_department_name_casefold_key" ON "Position"("organizationId","departmentId",lower("name"));
COMMIT;
