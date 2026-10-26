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

  /**
   * Atomically claim one usage of the coupon. Returns the number of rows
   * updated (0 when the usage limit was reached or the coupon is gone).
   * Pass `db` (a transaction client) when called inside prisma.$transaction.
   */
  incrementUsage: (id, db = prisma) =>
    db.$executeRaw`
      UPDATE coupons
      SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
      WHERE id = ${id}
        AND ("maxUsage" IS NULL OR "usageCount" < "maxUsage")
    `,

  delete: (id) => prisma.coupon.delete({ where: { id } }),
};

module.exports = couponRepository;
