'use strict';

const { prisma } = require('../config/db');

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
   * Idempotent claim for Stripe webhooks: transitions PENDING/FAILED → SUCCEEDED
   * at most once per intent. Returns { count } — 0 means a duplicate delivery
   * (or unknown intent) must be ignored.
   */
  claimSucceeded: (stripePaymentIntentId) =>
    prisma.payment.updateMany({
      where: { stripePaymentIntentId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCEEDED' },
    }),

  /**
   * Full "payment succeeded" processing in ONE transaction:
   * 1. CAS-claims the payment (PENDING/FAILED → SUCCEEDED) — duplicates return null.
   * 2. Increments appointment.amountPaid, recomputes paymentStatus, and confirms
   *    only a PENDING appointment (a late webhook never resurrects CANCELLED).
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

      const newAmountPaid = parseFloat(updated.amountPaid);
      const servicePrice = parseFloat(updated.service.price);
      const paymentStatus = newAmountPaid >= servicePrice ? 'PAID' : 'PARTIAL';

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

  /** Guarded REFUNDED transition — only from SUCCEEDED. */
  claimRefunded: (stripePaymentIntentId) =>
    prisma.payment.updateMany({
      where: { stripePaymentIntentId, status: 'SUCCEEDED' },
      data: { status: 'REFUNDED' },
    }),

  getTotalRevenue: () =>
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
};

module.exports = paymentRepository;
