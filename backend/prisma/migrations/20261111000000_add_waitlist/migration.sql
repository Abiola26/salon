-- Phase 12a: customer waitlist for fully booked service/date combinations.
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CONVERTED', 'CANCELLED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NOTIFY_WAITLIST';

CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT,
    "preferredDate" DATE NOT NULL,
    "preferredTime" TEXT,
    "notes" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waitlist_entries_preferredDate_status_idx"
  ON "waitlist_entries"("preferredDate", "status");
CREATE INDEX "waitlist_entries_serviceId_preferredDate_status_idx"
  ON "waitlist_entries"("serviceId", "preferredDate", "status");
CREATE INDEX "waitlist_entries_userId_status_idx"
  ON "waitlist_entries"("userId", "status");

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
