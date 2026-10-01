-- CreateEnum
CREATE TYPE "LeaveApproverKind" AS ENUM ('MANAGER', 'HR');

-- CreateEnum
CREATE TYPE "LeaveDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveDocumentKind" AS ENUM ('SUPPORTING', 'MEDICAL_CERTIFICATE');

-- CreateEnum
CREATE TYPE "LeaveChangeKind" AS ENUM ('CANCELLATION', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "LeaveChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "approvalWorkflowId" TEXT;

-- AlterTable
ALTER TABLE "LeavePolicy" ADD COLUMN     "medicalCertificateAfterDays" INTEGER,
ADD COLUMN     "supportingDocumentRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LeaveApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprovalStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "LeaveApproverKind" NOT NULL,
    "approverUserId" TEXT NOT NULL,

    CONSTRAINT "LeaveApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprovalDelegation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApprovalDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "LeaveDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "LeaveDocumentKind" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveChangeRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "LeaveChangeKind" NOT NULL,
    "status" "LeaveChangeStatus" NOT NULL DEFAULT 'PENDING',
    "proposedStart" DATE,
    "proposedEnd" DATE,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveApprovalWorkflow_organizationId_leaveTypeId_isActive_idx" ON "LeaveApprovalWorkflow"("organizationId", "leaveTypeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApprovalStep_workflowId_order_key" ON "LeaveApprovalStep"("workflowId", "order");

-- CreateIndex
CREATE INDEX "LeaveApprovalDelegation_organizationId_fromUserId_effective_idx" ON "LeaveApprovalDelegation"("organizationId", "fromUserId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApprovalDecision_requestId_stepId_key" ON "LeaveApprovalDecision"("requestId", "stepId");

-- CreateIndex
CREATE INDEX "LeaveDocument_organizationId_requestId_idx" ON "LeaveDocument"("organizationId", "requestId");

-- CreateIndex
CREATE INDEX "LeaveComment_requestId_createdAt_idx" ON "LeaveComment"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveChangeRequest_requestId_status_idx" ON "LeaveChangeRequest"("requestId", "status");

-- CreateIndex
CREATE INDEX "LeaveNotification_organizationId_recipientUserId_readAt_idx" ON "LeaveNotification"("organizationId", "recipientUserId", "readAt");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvalWorkflowId_fkey" FOREIGN KEY ("approvalWorkflowId") REFERENCES "LeaveApprovalWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalWorkflow" ADD CONSTRAINT "LeaveApprovalWorkflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalWorkflow" ADD CONSTRAINT "LeaveApprovalWorkflow_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalStep" ADD CONSTRAINT "LeaveApprovalStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "LeaveApprovalWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalDelegation" ADD CONSTRAINT "LeaveApprovalDelegation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalDecision" ADD CONSTRAINT "LeaveApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalDecision" ADD CONSTRAINT "LeaveApprovalDecision_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "LeaveApprovalStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDocument" ADD CONSTRAINT "LeaveDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDocument" ADD CONSTRAINT "LeaveDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveComment" ADD CONSTRAINT "LeaveComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveChangeRequest" ADD CONSTRAINT "LeaveChangeRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveNotification" ADD CONSTRAINT "LeaveNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
