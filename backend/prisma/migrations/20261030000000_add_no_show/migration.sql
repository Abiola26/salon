-- Track no-shows explicitly so late-cancellation policy can be enforced and
-- the hourly completion marker never converts them to COMPLETED.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';

-- Dedicated audit action for admin no-show markings.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MARK_NO_SHOW';
