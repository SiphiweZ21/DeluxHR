-- =========================================================
-- Migration 19: Employee Lifecycle Foundation
-- =========================================================

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM (
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'TERMINATED'
);

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM (
  'SOUTH_AFRICAN_ID',
  'PASSPORT',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM (
  'PERMANENT',
  'FIXED_TERM',
  'TEMPORARY',
  'PART_TIME',
  'CONTRACTOR',
  'INTERN'
);

-- =========================================================
-- Add employee lifecycle fields
--
-- employeeNumber is intentionally nullable during the
-- backfill. It becomes NOT NULL after existing employees
-- receive generated employee numbers.
-- =========================================================

ALTER TABLE "Employee"
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "activatedByUserId" TEXT,
ADD COLUMN "employeeNumber" TEXT,
ADD COLUMN "employmentEndDate" TIMESTAMP(3),
ADD COLUMN "employmentStartDate" TIMESTAMP(3),
ADD COLUMN "employmentType" "EmploymentType",
ADD COLUMN "identityNumber" TEXT,
ADD COLUMN "identityType" "IdentityType",
ADD COLUMN "jobTitle" TEXT,
ADD COLUMN "status" "EmployeeStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
ADD COLUMN "terminatedAt" TIMESTAMP(3),
ADD COLUMN "terminationReason" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "verifiedByUserId" TEXT;

-- =========================================================
-- Backfill existing employees
--
-- Employee numbers are generated independently within each
-- organization:
--
-- EMP-000001
-- EMP-000002
-- ...
--
-- createdAt + id provides deterministic ordering.
-- =========================================================

WITH ranked_employees AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId"
      ORDER BY "createdAt", "id"
    ) AS employee_sequence
  FROM "Employee"
)
UPDATE "Employee" AS employee
SET "employeeNumber" =
  'EMP-' ||
  LPAD(
    ranked_employees.employee_sequence::TEXT,
    6,
    '0'
  )
FROM ranked_employees
WHERE employee."id" = ranked_employees."id";

-- =========================================================
-- Existing employees pre-date the verification lifecycle.
-- Preserve their current operational state by treating them
-- as ACTIVE.
--
-- Employees created after this migration will use the
-- schema default PENDING_VERIFICATION.
-- =========================================================

UPDATE "Employee"
SET "status" = 'ACTIVE'::"EmployeeStatus";

-- =========================================================
-- Employee number is now safe to require.
-- =========================================================

ALTER TABLE "Employee"
ALTER COLUMN "employeeNumber" SET NOT NULL;

-- =========================================================
-- Indexes and constraints
-- =========================================================

CREATE INDEX "Employee_organizationId_status_idx"
ON "Employee"("organizationId", "status");

CREATE INDEX "Employee_organizationId_identityNumber_idx"
ON "Employee"("organizationId", "identityNumber");

CREATE UNIQUE INDEX "Employee_organizationId_employeeNumber_key"
ON "Employee"("organizationId", "employeeNumber");
