-- Migration 14: Platform & Tenant Foundation
--
-- Goals:
-- 1. Introduce organization lifecycle statuses.
-- 2. Preserve existing organizations as ACTIVE.
-- 3. Make future organizations PENDING by default.
-- 4. Replace legacy OWNER/ADMIN roles with COMPANY_ADMIN.
-- 5. Introduce DeluxHR platform roles and customer access roles.
-- 6. Allow platform users to exist without a customer organization.
-- 7. Add indexes for organization status and user role.

-- ============================================================
-- Organization Status
-- ============================================================

CREATE TYPE "OrganizationStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED'
);

-- Add the column as nullable first so existing organizations
-- can be migrated deliberately.
ALTER TABLE "Organization"
ADD COLUMN "status" "OrganizationStatus";

-- Existing organizations pre-date the approval workflow and
-- are therefore treated as already active.
UPDATE "Organization"
SET "status" = 'ACTIVE'
WHERE "status" IS NULL;

-- Future organizations must go through the approval workflow.
ALTER TABLE "Organization"
ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "Organization"
ALTER COLUMN "status" SET NOT NULL;


-- ============================================================
-- User Roles
-- ============================================================

-- PostgreSQL enums cannot safely remove OWNER/ADMIN while rows
-- still contain those values. Create the replacement enum first.

CREATE TYPE "UserRole_new" AS ENUM (
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'COMPANY_ADMIN',
  'EXECUTIVE',
  'HR_ADMIN',
  'PAYROLL_ADMIN',
  'MANAGER',
  'EMPLOYEE'
);

-- Convert existing roles while changing the column type.
--
-- OWNER -> COMPANY_ADMIN
-- ADMIN -> COMPANY_ADMIN
-- MANAGER and EMPLOYEE remain unchanged.

ALTER TABLE "User"
ALTER COLUMN "role"
TYPE "UserRole_new"
USING (
  CASE
    WHEN "role"::text = 'OWNER' THEN 'COMPANY_ADMIN'
    WHEN "role"::text = 'ADMIN' THEN 'COMPANY_ADMIN'
    ELSE "role"::text
  END
)::"UserRole_new";

-- Replace the old enum type.

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";


-- ============================================================
-- Platform Users
-- ============================================================

-- SUPER_ADMIN and PLATFORM_ADMIN belong to DeluxHR itself,
-- rather than to an individual customer organization.
ALTER TABLE "User"
ALTER COLUMN "organizationId" DROP NOT NULL;


-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX "Organization_status_idx"
ON "Organization"("status");

CREATE INDEX "User_role_idx"
ON "User"("role");
