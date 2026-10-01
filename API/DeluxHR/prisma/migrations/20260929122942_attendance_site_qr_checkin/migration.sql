/*
  Warnings:

  - A unique constraint covering the columns `[siteQrToken]` on the table `WorkLocation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WorkLocation" ADD COLUMN     "siteQrRotatedAt" TIMESTAMP(3),
ADD COLUMN     "siteQrToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkLocation_siteQrToken_key" ON "WorkLocation"("siteQrToken");
