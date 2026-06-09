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

  getTotalRevenue: () =>
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
};

module.exports = paymentRepository;
