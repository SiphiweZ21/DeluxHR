-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('MANAGE_COMPANY', 'MANAGE_USERS', 'MANAGE_ACCESS', 'VIEW_EMPLOYEES', 'MANAGE_EMPLOYEES', 'ADD_EMPLOYEES', 'VIEW_TEAM', 'VIEW_SELF', 'MANAGE_LEAVE', 'APPROVE_TEAM_LEAVE', 'REQUEST_LEAVE', 'VIEW_ATTENDANCE', 'MANAGE_ATTENDANCE', 'APPROVE_TIMESHEETS', 'VIEW_PAYROLL', 'MANAGE_PAYROLL', 'GENERATE_PAYROLL', 'REVIEW_PAYROLL', 'APPROVE_PAYROLL', 'VIEW_ALL_PAYSLIPS', 'VIEW_OWN_PAYSLIP', 'VIEW_EXECUTIVE_DASHBOARD', 'VIEW_WORKFORCE_COST', 'VIEW_WORKFORCE_INSIGHTS', 'MANAGE_EARLY_PAY_POLICY', 'APPROVE_EARLY_PAY', 'REQUEST_EARLY_PAY', 'VIEW_AUDIT_LOGS');

-- CreateEnum
CREATE TYPE "DataScope" AS ENUM ('SELF', 'TEAM', 'DEPARTMENT', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "scope" "DataScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPermission_organizationId_idx" ON "UserPermission"("organizationId");

-- CreateIndex
CREATE INDEX "UserPermission_userId_idx" ON "UserPermission"("userId");

-- CreateIndex
CREATE INDEX "UserPermission_permission_idx" ON "UserPermission"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
