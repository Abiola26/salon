-- Phase 9: admin-completed appointments are audited
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMPLETE_APPOINTMENT';
