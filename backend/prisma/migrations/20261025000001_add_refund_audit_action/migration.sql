-- Add a dedicated audit action for admin refunds (previously overloading CANCEL_APPOINTMENT).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REFUND_PAYMENT';
