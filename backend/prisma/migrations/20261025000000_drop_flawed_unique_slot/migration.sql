-- Drop the flawed slot-uniqueness constraint.
--
-- It was created as appointments_appointmentDate_appointmentTime_staffId_status_key
-- by migration 20260624000000, but the schema later renamed it to "unique_slot"
-- (schema drift), so both possible names are dropped defensively.
--
-- Why it was wrong:
--   * `status` was part of the key, so (date,time,staff,'PENDING') and
--     (date,time,staff,'CONFIRMED') could coexist — double bookings passed the
--     constraint, and the webhook's PENDING -> CONFIRMED flip could then throw
--     P2002 and wedge payment processing.
--   * staffId is nullable and NULLs are distinct in Postgres unique indexes,
--     so unassigned bookings were never protected anyway.
--
-- Slot exclusivity is now enforced by appointment.service.js: a per-date
-- Postgres advisory lock (pg_advisory_xact_lock) inside a transaction,
-- followed by a duration-aware overlap check (checkSlotConflict).
DROP INDEX IF EXISTS "unique_slot";
DROP INDEX IF EXISTS "appointments_appointmentDate_appointmentTime_staffId_status_key";
