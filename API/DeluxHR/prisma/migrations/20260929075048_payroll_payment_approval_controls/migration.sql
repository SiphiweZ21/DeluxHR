-- AlterEnum
ALTER TYPE "PayrollPaymentBatchStatus" ADD VALUE 'APPROVED_FOR_EXPORT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'PREPARE_PAYROLL_PAYMENTS';
ALTER TYPE "Permission" ADD VALUE 'APPROVE_PAYROLL_PAYMENTS';
ALTER TYPE "Permission" ADD VALUE 'EXPORT_PAYROLL_PAYMENTS';

-- AlterTable
ALTER TABLE "PayrollPaymentBatch" ADD COLUMN     "approvedForExportAt" TIMESTAMP(3),
ADD COLUMN     "approvedForExportByUserId" TEXT;
