-- Phase 10: reminder opt-outs + per-appointment reminder dedupe markers.
-- Transactional emails (confirmations/receipts/cancellations/refunds) are not
-- affected by these preferences.

ALTER TABLE "users"
  ADD COLUMN "emailReminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "smsReminders" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "appointments"
  ADD COLUMN "emailReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "smsReminderSentAt" TIMESTAMP(3);
