-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "companySnapshot" JSONB,
ADD COLUMN     "documentSnapshot" JSONB,
ADD COLUMN     "employeeSnapshot" JSONB,
ADD COLUMN     "financialSnapshot" JSONB,
ADD COLUMN     "paymentSnapshot" JSONB,
ADD COLUMN     "snapshotVersion" INTEGER NOT NULL DEFAULT 1;
