-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'VIEW_HR_REQUESTS';
ALTER TYPE "Permission" ADD VALUE 'MANAGE_HR_REQUESTS';

-- AlterTable
ALTER TABLE "HrServiceRequest" ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "resolutionDueAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "responseDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HrRequestCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "responseSlaHours" INTEGER NOT NULL DEFAULT 24,
    "resolutionSlaHours" INTEGER NOT NULL DEFAULT 72,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HrRequestCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRequestComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRequestAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrRequestCategory_organizationId_code_key" ON "HrRequestCategory"("organizationId", "code");

-- CreateIndex
CREATE INDEX "HrRequestComment_requestId_createdAt_idx" ON "HrRequestComment"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "HrRequestAttachment_requestId_createdAt_idx" ON "HrRequestAttachment"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "HrRequestEvent_requestId_createdAt_idx" ON "HrRequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "HrServiceRequest_organizationId_status_priority_createdAt_idx" ON "HrServiceRequest"("organizationId", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "HrServiceRequest_organizationId_assignedToUserId_status_idx" ON "HrServiceRequest"("organizationId", "assignedToUserId", "status");

-- AddForeignKey
ALTER TABLE "HrServiceRequest" ADD CONSTRAINT "HrServiceRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HrRequestCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRequestCategory" ADD CONSTRAINT "HrRequestCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRequestComment" ADD CONSTRAINT "HrRequestComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HrServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRequestAttachment" ADD CONSTRAINT "HrRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HrServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRequestEvent" ADD CONSTRAINT "HrRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HrServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve SLA visibility for requests created by the Phase 6F WhatsApp path.
UPDATE "HrServiceRequest" SET
  "responseDueAt" = "createdAt" + INTERVAL '24 hours',
  "resolutionDueAt" = "createdAt" + INTERVAL '72 hours',
  "firstResponseAt" = CASE WHEN "status" <> 'OPEN' THEN "updatedAt" ELSE NULL END,
  "resolvedAt" = CASE WHEN "status" IN ('RESOLVED','CLOSED') THEN "updatedAt" ELSE NULL END,
  "closedAt" = CASE WHEN "status" = 'CLOSED' THEN "updatedAt" ELSE NULL END
WHERE "responseDueAt" IS NULL;
