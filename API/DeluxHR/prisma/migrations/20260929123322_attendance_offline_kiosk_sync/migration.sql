/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,deviceReference,offlineEventId]` on the table `AttendanceEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AttendanceEvent" ADD COLUMN     "offlineEventId" TEXT;

-- CreateIndex
CREATE INDEX "AttendanceEvent_organizationId_deviceReference_offlineEvent_idx" ON "AttendanceEvent"("organizationId", "deviceReference", "offlineEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEvent_organizationId_deviceReference_offlineEvent_key" ON "AttendanceEvent"("organizationId", "deviceReference", "offlineEventId");
