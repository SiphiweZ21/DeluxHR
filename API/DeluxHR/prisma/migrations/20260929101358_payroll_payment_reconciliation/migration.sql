-- CreateEnum
CREATE TYPE "PayrollPaymentReconciliationStatus" AS ENUM ('UNRESOLVED', 'MATCHED', 'DIFFERENCE');

-- AlterTable
ALTER TABLE "PayrollPaymentBatch" ADD COLUMN     "reconciledActualAmount" DOUBLE PRECISION,
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "reconciledByUserId" TEXT,
ADD COLUMN     "reconciledExpectedAmount" DOUBLE PRECISION,
ADD COLUMN     "reconciliationDifference" DOUBLE PRECISION,
ADD COLUMN     "reconciliationStatus" "PayrollPaymentReconciliationStatus" NOT NULL DEFAULT 'UNRESOLVED';

-- AlterTable
ALTER TABLE "PayrollPaymentItem" ADD COLUMN     "actualPaidAmount" DOUBLE PRECISION,
ADD COLUMN     "reconciliationDifference" DOUBLE PRECISION,
ADD COLUMN     "reconciliationStatus" "PayrollPaymentReconciliationStatus" NOT NULL DEFAULT 'UNRESOLVED';
