-- AlterTable
ALTER TABLE "LeavePolicy" ADD COLUMN     "balanceRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AttendanceReviewSettings" (
    "whatsappAlerts" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "locationMode" TEXT NOT NULL DEFAULT 'REVIEW',
    "reminderMinutes" INTEGER NOT NULL DEFAULT 5,
    "supervisorMinutes" INTEGER NOT NULL DEFAULT 10,
    "escalationMinutes" INTEGER NOT NULL DEFAULT 20,
    "reviewerUserId" TEXT,
    "operationsUserId" TEXT,
    "siteRouting" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceReviewSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AttendanceAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "eventType" "AttendanceEventType" NOT NULL,
    "channel" "AttendanceChannel" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "workLocationId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "distanceM" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftStart" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "explanation" TEXT,
    "resolution" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "acceptedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAlert" (
    "whatsappStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "whatsappClaimedAt" TIMESTAMP(3),
    "whatsappProviderId" TEXT,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "incidentKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "shiftStart" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAttempt_acceptedEventId_key" ON "AttendanceAttempt"("acceptedEventId");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_organizationId_status_capturedAt_idx" ON "AttendanceAttempt"("organizationId", "status", "capturedAt");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_organizationId_employeeId_capturedAt_idx" ON "AttendanceAttempt"("organizationId", "employeeId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAttempt_organizationId_sourceReference_key" ON "AttendanceAttempt"("organizationId", "sourceReference");

-- CreateIndex
CREATE INDEX "AttendanceAlert_organizationId_recipientUserId_createdAt_idx" ON "AttendanceAlert"("organizationId", "recipientUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAlert_organizationId_recipientUserId_incidentKey_key" ON "AttendanceAlert"("organizationId", "recipientUserId", "incidentKey");

-- AddForeignKey
ALTER TABLE "AttendanceReviewSettings" ADD CONSTRAINT "AttendanceReviewSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAlert" ADD CONSTRAINT "AttendanceAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAlert" ADD CONSTRAINT "AttendanceAlert_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAlert" ADD CONSTRAINT "AttendanceAlert_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
