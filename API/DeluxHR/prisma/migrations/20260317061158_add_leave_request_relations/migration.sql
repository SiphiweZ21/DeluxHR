/*
  Warnings:

  - You are about to drop the column `createdAt` on the `LeaveRequest` table. All the data in the column will be lost.
  - Added the required column `leaveTypeId` to the `LeaveRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LeaveRequest" DROP COLUMN "createdAt",
ADD COLUMN     "leaveTypeId" TEXT NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
