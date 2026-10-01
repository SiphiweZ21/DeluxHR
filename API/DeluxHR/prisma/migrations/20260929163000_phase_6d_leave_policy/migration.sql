-- CreateEnum
CREATE TYPE "LeaveAccrualMode" AS ENUM ('ANNUAL_UPFRONT', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LeaveBalanceAdjustmentType" AS ENUM ('OPENING', 'CREDIT', 'DEBIT');

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "chargeBreakdown" JSONB,
ADD COLUMN     "chargedDays" DOUBLE PRECISION,
ADD COLUMN     "policyId" TEXT;

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "annualEntitlementDays" DOUBLE PRECISION NOT NULL,
    "accrualMode" "LeaveAccrualMode" NOT NULL DEFAULT 'ANNUAL_UPFRONT',
    "carryOverMaxDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carryOverExpiryMonths" INTEGER NOT NULL DEFAULT 0,
    "maxNegativeDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "probationMonths" INTEGER NOT NULL DEFAULT 0,
    "workingWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "excludePublicHolidays" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeavePolicyAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLeavePolicyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPublicHoliday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyPublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "type" "LeaveBalanceAdjustmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeavePolicy_organizationId_leaveTypeId_isDefault_idx" ON "LeavePolicy"("organizationId", "leaveTypeId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_organizationId_leaveTypeId_code_key" ON "LeavePolicy"("organizationId", "leaveTypeId", "code");

-- CreateIndex
CREATE INDEX "EmployeeLeavePolicyAssignment_organizationId_employeeId_lea_idx" ON "EmployeeLeavePolicyAssignment"("organizationId", "employeeId", "leaveTypeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPublicHoliday_organizationId_date_key" ON "CompanyPublicHoliday"("organizationId", "date");

-- CreateIndex
CREATE INDEX "LeaveBalanceAdjustment_organizationId_employeeId_leaveTypeI_idx" ON "LeaveBalanceAdjustment"("organizationId", "employeeId", "leaveTypeId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeavePolicyAssignment" ADD CONSTRAINT "EmployeeLeavePolicyAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeavePolicyAssignment" ADD CONSTRAINT "EmployeeLeavePolicyAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeavePolicyAssignment" ADD CONSTRAINT "EmployeeLeavePolicyAssignment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeavePolicyAssignment" ADD CONSTRAINT "EmployeeLeavePolicyAssignment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPublicHoliday" ADD CONSTRAINT "CompanyPublicHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
