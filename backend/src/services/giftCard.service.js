'use strict';

const { prisma } = require('../config/db');
const giftCardRepository = require('../repositories/giftCard.repository');
const paymentRepository = require('../repositories/payment.repository');
const { DEPOSIT_AMOUNT } = require('../config/env');
const { pointsForAmount } = require('../config/loyalty');
const { toCents, toDecimal2 } = require('../utils/money');
const { auditLog } = require('../utils/audit');
const {
  normalizeGiftCardCode,
  generateGiftCardCode,
  maskGiftCardCode,
} = require('../utils/giftCard');
const { sendGiftCardIssuedEmail, sendGiftCardAppliedEmail } = require('../utils/email');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const MAX_CODE_ATTEMPTS = 5;
const MIN_CARD_CENTS = 500;
const MAX_CARD_CENTS = 500000;

const publicCard = (card) => ({
  code: card.code,
  balance: card.balance,
  balanceCents: toCents(card.balance),
  currency: card.currency,
  status: card.status,
});

const requireActiveCard = (card) => {
  if (!card) throw ApiError.notFound('Gift card not found');
  if (card.status === 'VOID') throw ApiError.badRequest('This gift card has been voided');
  if (card.status !== 'ACTIVE' || toCents(card.balance) <= 0) {
    throw ApiError.badRequest('This gift card has no remaining balance');
  }
};

const clawBackPoints = async (tx, userId, pointsToClaw) => {
  if (pointsToClaw <= 0 || !userId) return;
  const clawed = await tx.user.updateMany({
    where: { id: userId, loyaltyPoints: { gte: pointsToClaw } },
    data: { loyaltyPoints: { decrement: pointsToClaw } },
  });
  if (clawed.count === 0) {
    await tx.user.updateMany({
      where: { id: userId, loyaltyPoints: { gt: 0 } },
      data: { loyaltyPoints: 0 },
    });
  }
};

const giftCardService = {
  async createGiftCard(actorId, dto, ipAddress = null) {
    const amountCents = Math.round(Number(dto.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < MIN_CARD_CENTS) {
      throw ApiError.badRequest('Gift card amount must be at least $5.00');
    }
    if (amountCents > MAX_CARD_CENTS) {
      throw ApiError.badRequest('Gift card amount cannot exceed $5,000.00');
    }

    const recipientEmail = dto.recipientEmail
      ? dto.recipientEmail.trim().toLowerCase()
      : null;

    let card = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !card; attempt += 1) {
      try {
        card = await giftCardRepository.create({
          code: generateGiftCardCode(),
          initialAmount: toDecimal2(amountCents),
          balance: toDecimal2(amountCents),
          currency: 'cad',
          recipientName: dto.recipientName?.trim() || null,
          recipientEmail,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
        });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        logger.warn(`Gift card code collision (attempt ${attempt + 1}) — retrying`);
      }
    }

    if (!card) {
      throw ApiError.conflict('Could not generate a unique gift card code. Please try again.');
    }

    await auditLog({
      userId: actorId,
      action: 'CREATE_GIFT_CARD',
      details:
        `Created gift card ${card.code} for $${toDecimal2(amountCents)}` +
        (recipientEmail ? ` (recipient: ${recipientEmail})` : ''),
      ipAddress,
    });

    if (recipientEmail) {
      sendGiftCardIssuedEmail(
        { name: card.recipientName || 'there', email: recipientEmail },
        card
      ).catch(() => {});
    }

    return giftCardRepository.findById(card.id);
  },

  async getAdminGiftCards({ page = 1, limit = 20, status, search } = {}) {
    const skip = (page - 1) * limit;
    const [cards, total, rawSummary] = await Promise.all([
      giftCardRepository.findAll({ skip, take: limit, status, search }),
      giftCardRepository.count({ status, search }),
      giftCardRepository.getSummary(),
    ]);

    const summary = {
      active: 0,
      depleted: 0,
      void: 0,
      total: 0,
      activeBalance: parseFloat(rawSummary.activeBalance._sum.balance || 0),
      totalIssued: parseFloat(rawSummary.issued._sum.initialAmount || 0),
      totalRedeemed: parseFloat(rawSummary.redeemed._sum.amount || 0),
    };
    for (const row of rawSummary.statusCounts) {
      summary[row.status.toLowerCase()] = row._count._all;
      summary.total += row._count._all;
    }

    return {
      cards,
      summary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async getGiftCardById(id) {
    const card = await giftCardRepository.findByIdWithRedemptions(id);
    if (!card) throw ApiError.notFound('Gift card not found');
    return card;
  },

  async getMyGiftCards(user) {
    if (!user?.email) return [];
    return giftCardRepository.findActiveByRecipientEmail(user.email);
  },

  async validateGiftCard(code) {
    const normalized = normalizeGiftCardCode(code);
    if (!normalized) throw ApiError.badRequest('Invalid gift card code');

    const card = await giftCardRepository.findByCode(normalized);
    requireActiveCard(card);
    return publicCard(card);
  },

  async voidGiftCard(id, actorId, ipAddress = null) {
    const card = await giftCardRepository.findById(id);
    if (!card) throw ApiError.notFound('Gift card not found');
    if (card.status === 'VOID') throw ApiError.badRequest('Gift card is already voided');
    if (card.status === 'DEPLETED') {
      throw ApiError.badRequest('A depleted gift card cannot be voided');
    }

    const updated = await giftCardRepository.updateStatus(id, 'VOID');

    await auditLog({
      userId: actorId,
      action: 'VOID_GIFT_CARD',
      details:
        `Voided gift card ${card.code} with $${card.balance} remaining` +
        (card.recipientEmail ? ` (recipient: ${card.recipientEmail})` : ''),
      ipAddress,
    });

    return updated;
  },

  /**
   * Debit a card against the amount due for an appointment. The appointment
   * advisory lock serializes concurrent attempts, and the card row is locked
   * FOR UPDATE while its balance is read. The caller creates the Stripe intent
   * for the returned residual (or skips Stripe when it is zero).
   */
  async applyForPayment({ userId, appointmentId, paymentType, giftCardCode, ipAddress = null }) {
    const code = normalizeGiftCardCode(giftCardCode);
    if (!code) throw ApiError.badRequest('Invalid gift card code');

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`salon:payment:${appointmentId}`})::bigint)`;

        const lockedRows = await tx.$queryRaw`
          SELECT "id" FROM "gift_cards" WHERE "code" = ${code} FOR UPDATE
        `;
        if (!lockedRows || lockedRows.length === 0) {
          throw ApiError.notFound('Gift card not found');
        }

        const card = await giftCardRepository.findByCode(code, tx);
        requireActiveCard(card);

        const appointment = await tx.appointment.findUnique({
          where: { id: appointmentId },
          include: { service: true },
        });
        if (!appointment) throw ApiError.notFound('Appointment not found');
        if (appointment.userId !== userId) {
          throw ApiError.forbidden('Not authorized to pay for this appointment');
        }
        if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
          throw ApiError.badRequest('This appointment can no longer accept payment');
        }
        if (appointment.paymentStatus === 'PAID') {
          throw ApiError.badRequest('This appointment is already fully paid');
        }
        if (paymentType === 'DEPOSIT' && appointment.paymentStatus === 'PARTIAL') {
          throw ApiError.badRequest('A deposit has already been paid. Please complete full payment.');
        }

        const dueCents = Math.max(
          0,
          toCents(appointment.service.price) - toCents(appointment.discountAmount)
        );
        const remainingCents = dueCents - toCents(appointment.amountPaid);
        if (remainingCents <= 0) {
          throw ApiError.badRequest('No outstanding balance for this appointment');
        }

        const depositCents = Math.round(
          (typeof DEPOSIT_AMOUNT === 'number' ? DEPOSIT_AMOUNT : 30) * 100
        );
        const targetCents =
          paymentType === 'DEPOSIT'
            ? Math.min(depositCents, remainingCents)
            : remainingCents;

        const balanceCents = toCents(card.balance);
        let appliedCents = Math.min(balanceCents, targetCents);
        let chargeCents = targetCents - appliedCents;

        // Stripe rejects sub-$0.50 charges. If the card would leave a tiny
        // residual, apply less so the card covers all but $0.50.
        if (chargeCents > 0 && chargeCents < 50) {
          const reduction = 50 - chargeCents;
          if (appliedCents >= reduction) {
            appliedCents -= reduction;
            chargeCents = 50;
          }
          if (appliedCents <= 0) {
            throw ApiError.badRequest(
              'The remaining balance after this gift card would be below Stripe\'s $0.50 minimum. Please use the card for the full amount at the salon.'
            );
          }
        }

        const newBalanceCents = balanceCents - appliedCents;
        const debit = await tx.giftCard.updateMany({
          where: {
            id: card.id,
            status: 'ACTIVE',
            balance: { gte: toDecimal2(appliedCents) },
          },
          data: {
            balance: { decrement: toDecimal2(appliedCents) },
            status: newBalanceCents > 0 ? 'ACTIVE' : 'DEPLETED',
          },
        });
        if (!debit || debit.count === 0) {
          throw ApiError.conflict('Gift card balance changed. Please try again.');
        }

        const paid = await tx.appointment.update({
          where: { id: appointmentId },
          data: { amountPaid: { increment: toDecimal2(appliedCents) } },
          include: { service: { select: { price: true } } },
        });

        const paidCents = toCents(paid.amountPaid);
        const dueAfterCents = Math.max(
          0,
          toCents(paid.service.price) - toCents(paid.discountAmount)
        );
        const paymentStatus =
          paidCents === 0 ? 'UNPAID' : paidCents >= dueAfterCents ? 'PAID' : 'PARTIAL';

        const updatedAppointment = await tx.appointment.update({
          where: { id: appointmentId },
          data: {
            paymentStatus,
            // Only confirm when the gift card closed the full target; a
            // residual Stripe charge must succeed before the booking confirms.
            ...(paid.status === 'PENDING' && chargeCents === 0 && { status: 'CONFIRMED' }),
          },
          include: {
            service: true,
            staff: { select: { id: true, name: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        });

        await giftCardRepository.createRedemption(
          {
            giftCardId: card.id,
            appointmentId,
            amount: toDecimal2(appliedCents),
            status: 'APPLIED',
          },
          tx
        );

        const pointsEarned = pointsForAmount(toDecimal2(appliedCents));
        if (pointsEarned > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { loyaltyPoints: { increment: pointsEarned } },
          });
        }

        const updatedCard = await giftCardRepository.findById(card.id, tx);
        return { card: updatedCard, appointment: updatedAppointment, appliedCents, chargeCents, pointsEarned };
      },
      { timeout: 10000 }
    );

    await auditLog({
      userId,
      action: 'REDEEM_GIFT_CARD',
      details:
        `Applied $${toDecimal2(result.appliedCents)} gift card ${maskGiftCardCode(result.card.code)} ` +
        `to appointment ${appointmentId}`,
      ipAddress,
    });

    sendGiftCardAppliedEmail(
      result.appointment.user,
      result.card,
      result.appliedCents,
      result.appointment,
      result.appointment.service
    ).catch(() => {});

    return result;
  },

  /**
   * Restore card credit when an appointment is cancelled. Runs inside the
   * caller's transaction. Late customer cancellations pass `forfeit: true`;
   * voided cards are never restored. Restored value also claws back the points
   * that redemption earned.
   */
  async restoreForAppointment(appointmentId, { forfeit = false } = {}, db = prisma) {
    const inTx = db === prisma ? (fn) => prisma.$transaction(fn) : (fn) => fn(db);

    return inTx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`salon:payment:${appointmentId}`})::bigint)`;

      const redemptions = await giftCardRepository.findAppliedRedemptions(appointmentId, tx);
      if (redemptions.length === 0) {
        return { restoredCents: 0, forfeitedCents: 0, pointsClawed: 0 };
      }

      if (forfeit) {
        let forfeitedCents = 0;
        for (const redemption of redemptions) {
          const claimed = await giftCardRepository.markRedemptionStatus(
            redemption.id,
            ['APPLIED'],
            'FORFEITED',
            tx
          );
          if (claimed.count > 0) forfeitedCents += toCents(redemption.amount);
        }
        return {
          restoredCents: 0,
          forfeitedCents,
          pointsClawed: 0,
        };
      }

      const cardIds = [...new Set(redemptions.map((row) => row.giftCardId))].sort();
      for (const cardId of cardIds) {
        await tx.$queryRaw`SELECT "id" FROM "gift_cards" WHERE "id" = ${cardId} FOR UPDATE`;
      }
      const cards = await tx.giftCard.findMany({ where: { id: { in: cardIds } } });
      const cardById = new Map(cards.map((card) => [card.id, card]));

      let restoredCents = 0;
      let forfeitedCents = 0;
      const restoreByCard = new Map();

      for (const redemption of redemptions) {
        const card = cardById.get(redemption.giftCardId);
        if (!card || card.status === 'VOID') {
          const claimed = await giftCardRepository.markRedemptionStatus(
            redemption.id,
            ['APPLIED'],
            'FORFEITED',
            tx
          );
          if (claimed.count > 0) forfeitedCents += toCents(redemption.amount);
          continue;
        }

        const claimed = await giftCardRepository.markRedemptionStatus(
          redemption.id,
          ['APPLIED'],
          'RESTORED',
          tx
        );
        if (claimed.count === 0) continue;

        const amountCents = toCents(redemption.amount);
        restoredCents += amountCents;
        restoreByCard.set(
          card.id,
          (restoreByCard.get(card.id) || 0) + amountCents
        );
      }

      for (const [cardId, amountCents] of restoreByCard.entries()) {
        const card = cardById.get(cardId);
        const newBalanceCents = toCents(card.balance) + amountCents;
        await tx.giftCard.update({
          where: { id: cardId },
          data: {
            balance: toDecimal2(newBalanceCents),
            status: newBalanceCents > 0 ? 'ACTIVE' : card.status,
          },
        });
      }

      let pointsClawed = 0;
      if (restoredCents > 0) {
        const appointment = await paymentRepository.applyRefundToAppointment(
          appointmentId,
          toDecimal2(restoredCents),
          tx
        );
        pointsClawed = pointsForAmount(toDecimal2(restoredCents));
        await clawBackPoints(tx, appointment.userId, pointsClawed);
      }

      return { restoredCents, forfeitedCents, pointsClawed };
    });
  },
};

module.exports = giftCardService;
