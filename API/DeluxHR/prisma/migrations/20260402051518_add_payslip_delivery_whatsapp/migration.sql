-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "whatsappNumber" TEXT,
ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "periodLabel" TEXT;

-- CreateTable
CREATE TABLE "PayslipDelivery" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "whatsappStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "whatsappMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayslipDelivery_employeeId_idx" ON "PayslipDelivery"("employeeId");

-- CreateIndex
CREATE INDEX "PayslipDelivery_payrollRunId_idx" ON "PayslipDelivery"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayslipDelivery_payslipId_idx" ON "PayslipDelivery"("payslipId");

-- CreateIndex
CREATE INDEX "PayslipDelivery_whatsappStatus_idx" ON "PayslipDelivery"("whatsappStatus");

-- AddForeignKey
ALTER TABLE "PayslipDelivery" ADD CONSTRAINT "PayslipDelivery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipDelivery" ADD CONSTRAINT "PayslipDelivery_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
