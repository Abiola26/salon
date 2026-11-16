'use strict';

const { prisma } = require('../config/db');

const CREATED_BY = { select: { id: true, name: true, email: true } };

const CARD_INCLUDE = { createdBy: CREATED_BY };

const CARD_DETAIL_INCLUDE = {
  createdBy: CREATED_BY,
  redemptions: {
    include: {
      appointment: {
        include: {
          service: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
};

const searchWhere = (search) =>
  search
    ? {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { recipientName: { contains: search, mode: 'insensitive' } },
          { recipientEmail: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

const giftCardRepository = {
  create: (data, db = prisma) => db.giftCard.create({ data, include: CARD_INCLUDE }),

  findByCode: (code, db = prisma) =>
    db.giftCard.findUnique({ where: { code }, include: CARD_INCLUDE }),

  findById: (id, db = prisma) =>
    db.giftCard.findUnique({ where: { id }, include: CARD_INCLUDE }),

  findByIdWithRedemptions: (id) =>
    prisma.giftCard.findUnique({ where: { id }, include: CARD_DETAIL_INCLUDE }),

  findAll: ({ skip = 0, take = 20, status, search } = {}) =>
    prisma.giftCard.findMany({
      where: { ...(status && { status }), ...searchWhere(search) },
      include: CARD_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: ({ status, search } = {}) =>
    prisma.giftCard.count({
      where: { ...(status && { status }), ...searchWhere(search) },
    }),

  findActiveByRecipientEmail: (email) =>
    prisma.giftCard.findMany({
      where: {
        recipientEmail: { equals: email, mode: 'insensitive' },
        status: 'ACTIVE',
        balance: { gt: 0 },
      },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),

  getSummary: async () => {
    const [statusCounts, activeBalance, issued, redeemed] = await Promise.all([
      prisma.giftCard.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.giftCard.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { balance: true },
      }),
      prisma.giftCard.aggregate({ _sum: { initialAmount: true } }),
      prisma.giftCardRedemption.aggregate({
        where: { status: { in: ['APPLIED', 'FORFEITED'] } },
        _sum: { amount: true },
      }),
    ]);

    return { statusCounts, activeBalance, issued, redeemed };
  },

  updateStatus: (id, status, db = prisma) =>
    db.giftCard.update({ where: { id }, data: { status }, include: CARD_INCLUDE }),

  updateBalance: (id, data, db = prisma) =>
    db.giftCard.update({ where: { id }, data, include: CARD_INCLUDE }),

  findAppliedRedemptions: (appointmentId, db = prisma) =>
    db.giftCardRedemption.findMany({
      where: { appointmentId, status: 'APPLIED' },
      include: { giftCard: true },
      orderBy: { createdAt: 'asc' },
    }),

  markRedemptionStatus: (id, fromStatuses, status, db = prisma) =>
    db.giftCardRedemption.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status },
    }),

  createRedemption: (data, db = prisma) => db.giftCardRedemption.create({ data }),
};

module.exports = giftCardRepository;
