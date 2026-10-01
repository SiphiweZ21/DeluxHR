-- CreateTable
CREATE TABLE "WhatsAppEssIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppEssIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppEssSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verifiedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "flow" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppEssSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppInboundMessage" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "organizationId" TEXT,
    "employeeId" TEXT,
    "command" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppInboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrServiceRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceAnnouncement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "WorkforceAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipAccessLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipAccessLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppEssIdentity_employeeId_key" ON "WhatsAppEssIdentity"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppEssSession_phone_key" ON "WhatsAppEssSession"("phone");

-- CreateIndex
CREATE INDEX "WhatsAppEssSession_organizationId_employeeId_idx" ON "WhatsAppEssSession"("organizationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundMessage_providerMessageId_key" ON "WhatsAppInboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppInboundMessage_phone_receivedAt_idx" ON "WhatsAppInboundMessage"("phone", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrServiceRequest_reference_key" ON "HrServiceRequest"("reference");

-- CreateIndex
CREATE INDEX "HrServiceRequest_organizationId_employeeId_createdAt_idx" ON "HrServiceRequest"("organizationId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkforceAnnouncement_organizationId_isActive_publishedAt_idx" ON "WorkforceAnnouncement"("organizationId", "isActive", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayslipAccessLink_tokenHash_key" ON "PayslipAccessLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PayslipAccessLink_organizationId_employeeId_expiresAt_idx" ON "PayslipAccessLink"("organizationId", "employeeId", "expiresAt");

-- AddForeignKey
ALTER TABLE "WhatsAppEssIdentity" ADD CONSTRAINT "WhatsAppEssIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppEssIdentity" ADD CONSTRAINT "WhatsAppEssIdentity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppEssSession" ADD CONSTRAINT "WhatsAppEssSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppEssSession" ADD CONSTRAINT "WhatsAppEssSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrServiceRequest" ADD CONSTRAINT "HrServiceRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrServiceRequest" ADD CONSTRAINT "HrServiceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceAnnouncement" ADD CONSTRAINT "WorkforceAnnouncement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipAccessLink" ADD CONSTRAINT "PayslipAccessLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipAccessLink" ADD CONSTRAINT "PayslipAccessLink_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
