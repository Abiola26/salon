-- Phase 3 (ops): soft deletes, hot-path indexes, deprecated column cleanup.
--
-- Soft delete for services/staff/coupons/users: rows stay so appointment,
-- payment, review and audit history keep their FKs (deleting a user would
-- otherwise CASCADE appointments/payments away; deleting staff SET NULLs
-- their appointments' staffId).
--
-- users.refreshToken: deprecated in Phase 2 when sessions moved to the
-- refresh_tokens table — dropped now.

-- DropIndex
DROP INDEX "appointments_appointmentDate_idx";

-- DropIndex
DROP INDEX "email_queue_status_idx";

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "refreshToken",
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "appointments_appointmentDate_staffId_status_idx" ON "appointments"("appointmentDate", "staffId", "status");

-- CreateIndex
CREATE INDEX "email_queue_status_createdAt_idx" ON "email_queue"("status", "createdAt");
