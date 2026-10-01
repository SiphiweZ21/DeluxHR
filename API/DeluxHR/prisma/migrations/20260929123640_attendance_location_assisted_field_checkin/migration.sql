-- CreateEnum
CREATE TYPE "AttendanceLocationVerificationStatus" AS ENUM ('NOT_REQUESTED', 'NOT_CONFIGURED', 'WITHIN_RADIUS', 'OUTSIDE_RADIUS');

-- AlterTable
ALTER TABLE "AttendanceEvent" ADD COLUMN     "distanceFromWorkLocationM" DOUBLE PRECISION,
ADD COLUMN     "locationVerificationStatus" "AttendanceLocationVerificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
