-- CreateEnum
CREATE TYPE "EmployeePaymentDetailStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "EmployeePaymentDetail" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchCode" TEXT,
    "accountType" TEXT,
    "status" "EmployeePaymentDetailStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePaymentDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_organizationId_idx" ON "EmployeePaymentDetail"("organizationId");

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_employeeId_idx" ON "EmployeePaymentDetail"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_organizationId_employeeId_idx" ON "EmployeePaymentDetail"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_organizationId_status_idx" ON "EmployeePaymentDetail"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_employeeId_status_idx" ON "EmployeePaymentDetail"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_requestedByUserId_idx" ON "EmployeePaymentDetail"("requestedByUserId");

-- CreateIndex
CREATE INDEX "EmployeePaymentDetail_approvedByUserId_idx" ON "EmployeePaymentDetail"("approvedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePaymentDetail_employeeId_version_key" ON "EmployeePaymentDetail"("employeeId", "version");

-- AddForeignKey
ALTER TABLE "EmployeePaymentDetail" ADD CONSTRAINT "EmployeePaymentDetail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePaymentDetail" ADD CONSTRAINT "EmployeePaymentDetail_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
