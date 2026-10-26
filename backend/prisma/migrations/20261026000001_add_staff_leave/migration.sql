-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREATE_STAFF_LEAVE';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_STAFF_LEAVE';

-- CreateTable
CREATE TABLE "staff_leave" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_leave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_leave_staffId_startDate_endDate_idx" ON "staff_leave"("staffId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "staff_leave" ADD CONSTRAINT "staff_leave_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

