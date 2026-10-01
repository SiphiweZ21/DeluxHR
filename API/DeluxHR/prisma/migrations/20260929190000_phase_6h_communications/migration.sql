-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'VIEW_COMMUNICATIONS';
ALTER TYPE "Permission" ADD VALUE 'MANAGE_COMMUNICATIONS';

-- AlterTable
ALTER TABLE "WorkforceAnnouncement" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'COMPANY',
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "workLocationId" TEXT;

-- CreateTable
CREATE TABLE "CommunicationTeam" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationTeamMember" (
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "CommunicationTeamMember_pkey" PRIMARY KEY ("teamId","employeeId")
);

-- CreateTable
CREATE TABLE "AnnouncementReceipt" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementAttachment" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementEvent" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTeam_organizationId_name_key" ON "CommunicationTeam"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AnnouncementReceipt_employeeId_readAt_idx" ON "AnnouncementReceipt"("employeeId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementReceipt_announcementId_employeeId_key" ON "AnnouncementReceipt"("announcementId", "employeeId");

-- CreateIndex
CREATE INDEX "AnnouncementEvent_announcementId_createdAt_idx" ON "AnnouncementEvent"("announcementId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommunicationTeam" ADD CONSTRAINT "CommunicationTeam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationTeamMember" ADD CONSTRAINT "CommunicationTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "CommunicationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationTeamMember" ADD CONSTRAINT "CommunicationTeamMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementReceipt" ADD CONSTRAINT "AnnouncementReceipt_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "WorkforceAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementReceipt" ADD CONSTRAINT "AnnouncementReceipt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAttachment" ADD CONSTRAINT "AnnouncementAttachment_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "WorkforceAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementEvent" ADD CONSTRAINT "AnnouncementEvent_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "WorkforceAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing Phase 6F company announcements become visible to eligible portal employees.
INSERT INTO "AnnouncementReceipt" ("id", "announcementId", "employeeId")
SELECT md5(a."id" || ':' || e."id"), a."id", e."id"
FROM "WorkforceAnnouncement" a
JOIN "Employee" e ON e."organizationId" = a."organizationId"
WHERE e."status" = 'ACTIVE' AND e."userId" IS NOT NULL
ON CONFLICT ("announcementId", "employeeId") DO NOTHING;
