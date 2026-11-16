-- Phase 12b: admin-issued gift cards and their appointment redemptions.
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'VOID');
CREATE TYPE "GiftCardRedemptionStatus" AS ENUM ('APPLIED', 'RESTORED', 'FORFEITED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CREATE_GIFT_CARD';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VOID_GIFT_CARD';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REDEEM_GIFT_CARD';

CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialAmount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'cad',
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gift_cards_code_key" ON "gift_cards"("code");
CREATE INDEX "gift_cards_status_idx" ON "gift_cards"("status");
CREATE INDEX "gift_cards_recipientEmail_idx" ON "gift_cards"("recipientEmail");

CREATE TABLE "gift_card_redemptions" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "GiftCardRedemptionStatus" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_card_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gift_card_redemptions_giftCardId_idx"
  ON "gift_card_redemptions"("giftCardId");
CREATE INDEX "gift_card_redemptions_appointmentId_status_idx"
  ON "gift_card_redemptions"("appointmentId", "status");

ALTER TABLE "gift_cards"
  ADD CONSTRAINT "gift_cards_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gift_card_redemptions"
  ADD CONSTRAINT "gift_card_redemptions_giftCardId_fkey"
  FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gift_card_redemptions"
  ADD CONSTRAINT "gift_card_redemptions_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
