'use strict';

const { prisma } = require('../config/db');
const { toCents, toDecimal2 } = require('../utils/money');
const { pointsForAmount } = require('../config/loyalty');

const paymentRepository = {
  findById: (id) =>
    prisma.payment.findUnique({
      where: { id },
      include: { appointment: { include: { service: true } } },
    }),

  findByAppointmentId: (appointmentId) =>
    prisma.payment.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
    }),

  findByStripeIntentId: (stripePaymentIntentId) =>
    prisma.payment.findUnique({ where: { stripePaymentIntentId } }),

  findAll: ({ skip = 0, take = 20, userId, status } = {}) =>
    prisma.payment.findMany({
      where: {
        ...(userId && { userId }),
        ...(status && { status }),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        appointment: { include: { service: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.payment.count({ where }),

  create: (data) =>
    prisma.payment.create({
      data,
      include: { appointment: { include: { service: true } } },
    }),

  update: (id, data) => prisma.payment.update({ where: { id }, data }),

  updateByStripeIntentId: (stripePaymentIntentId, data) =>
    prisma.payment.update({ where: { stripePaymentIntentId }, data }),

  /**
   * Full "payment succeeded" processing in ONE transaction:
   * 1. CAS-claims the payment (PENDING/FAILED → SUCCEEDED) — duplicates return null.
   * 2. Increments appointment.amountPaid, recomputes paymentStatus in integer
   *    cents against price − discountAmount, and confirms only a PENDING
   *    appointment (a late webhook never resurrects CANCELLED).
   * Returns the updated appointment, or null when the event was a duplicate.
   */
  processSucceeded: (stripePaymentIntentId, appointmentId, amount) =>
    prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { stripePaymentIntentId, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'SUCCEEDED' },
      });
      if (claim.count === 0) return null;

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: { amountPaid: { increment: amount } },
        include: { service: { select: { price: true } } },
      });

      const paidCents = toCents(updated.amountPaid);
      const dueCents = Math.max(0, toCents(updated.service.price) - toCents(updated.discountAmount));
      const paymentStatus = paidCents >= dueCents ? 'PAID' : 'PARTIAL';

      const data = { paymentStatus };
      if (updated.status === 'PENDING') data.status = 'CONFIRMED';

      return tx.appointment.update({
        where: { id: appointmentId },
        data,
        include: {
          service: true,
          staff: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
    }),

  /** Guarded FAILED transition — never downgrades SUCCEEDED/REFUNDED. */
  claimFailed: (stripePaymentIntentId) =>
    prisma.payment.updateMany({
      where: { stripePaymentIntentId, status: 'PENDING' },
      data: { status: 'FAILED' },
    }),

  /**
   * Recompute appointment balance after a refund: decrement amountPaid
   * (clamped at 0) and recompute UNPAID/PARTIAL/PAID in integer cents —
   * both steps run in one transaction so a concurrent payment increment can
   * never be clobbered by the status write. Runs in its own transaction when
   * called standalone; reuses the caller's tx client when passed one.
   */
  applyRefundToAppointment: (appointmentId, amount, db = prisma) => {
    const inTx = db === prisma ? (fn) => prisma.$transaction(fn) : (fn) => fn(db);
    return inTx(async (tx) => {
      const decremented = await tx.appointment.update({
        where: { id: appointmentId },
        data: { amountPaid: { decrement: amount } },
        include: { service: { select: { price: true } } },
      });

      const paidCents = Math.max(0, toCents(decremented.amountPaid));
      const dueCents = Math.max(0, toCents(decremented.service.price) - toCents(decremented.discountAmount));
      const paymentStatus = paidCents === 0 ? 'UNPAID' : paidCents >= dueCents ? 'PAID' : 'PARTIAL';

      return tx.appointment.update({
        where: { id: appointmentId },
        data: { amountPaid: toDecimal2(paidCents), paymentStatus },
        include: {
          service: true,
          staff: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });
  },

  /**
   * Full "payment refunded" processing in ONE transaction:
   * 1. CAS-claims the payment (SUCCEEDED → REFUNDED) — duplicates return null.
   * 2. Recomputes the appointment balance via applyRefundToAppointment.
   * 3. Claws back the points this payment earned (per-payment floor, the same
   *    formula creditLoyaltyPoints used). A spend-down balance is clamped at 0,
   *    never negative.
   * Returns the updated appointment, or null when already processed.
   */
  processRefund: (stripePaymentIntentId) =>
    prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { stripePaymentIntentId, status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      if (claim.count === 0) return null;

      const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId } });
      if (!payment) return null;

      const appointment = await paymentRepository.applyRefundToAppointment(
        payment.appointmentId,
        payment.amount,
        tx
      );

      const pointsToClaw = pointsForAmount(payment.amount);
      if (pointsToClaw > 0 && appointment.userId) {
        const clawed = await tx.user.updateMany({
          where: { id: appointment.userId, loyaltyPoints: { gte: pointsToClaw } },
          data: { loyaltyPoints: { decrement: pointsToClaw } },
        });
        if (clawed.count === 0) {
          await tx.user.updateMany({
            where: { id: appointment.userId, loyaltyPoints: { gt: 0 } },
            data: { loyaltyPoints: 0 },
          });
        }
      }

      return appointment;
    }),

  getTotalRevenue: () =>
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
};

module.exports = paymentRepository;
