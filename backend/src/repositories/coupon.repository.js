'use strict';

const { prisma } = require('../config/db');

const couponRepository = {
  findByCode: (code) =>
    prisma.coupon.findUnique({ where: { code: code.toUpperCase() } }),

  findById: (id) =>
    prisma.coupon.findUnique({ where: { id } }),

  findAll: ({ skip = 0, take = 20 } = {}) =>
    prisma.coupon.findMany({
      include: { _count: { select: { appointments: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: () => prisma.coupon.count(),

  create: (data) => prisma.coupon.create({ data }),

  update: (id, data) =>
    prisma.coupon.update({ where: { id }, data }),

  incrementUsage: (id) =>
    prisma.coupon.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    }),

  delete: (id) => prisma.coupon.delete({ where: { id } }),
};

module.exports = couponRepository;
