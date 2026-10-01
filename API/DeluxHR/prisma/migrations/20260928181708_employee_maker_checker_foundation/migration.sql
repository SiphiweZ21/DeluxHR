-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Employee_organizationId_createdByUserId_idx" ON "Employee"("organizationId", "createdByUserId");
