-- AlterTable
ALTER TABLE "PayrollPaymentBatch" ADD COLUMN     "exportAdapterId" TEXT,
ADD COLUMN     "exportContentType" TEXT,
ADD COLUMN     "exportFileBytes" BYTEA,
ADD COLUMN     "exportSha256" TEXT,
ADD COLUMN     "fundingProfileId" TEXT,
ADD COLUMN     "fundingSnapshot" JSONB,
ADD COLUMN     "paymentDateSnapshot" TIMESTAMP(3);

