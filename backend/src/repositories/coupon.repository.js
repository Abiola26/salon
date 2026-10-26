'use strict';

const { prisma } = require('../config/db');

const couponRepository = {
  // findFirst (not findUnique): the unique `code` also holds mangled codes of
  // soft-deleted coupons, so both constraints must filter on deletedAt.
  findByCode: (code) =>
    prisma.coupon.findFirst({
      where: { code: code.toUpperCase(), deletedAt: null },
    }),

  findById: (id) =>
    prisma.coupon.findFirst({ where: { id, deletedAt: null } }),

  findAll: ({ skip = 0, take = 20 } = {}) =>
    prisma.coupon.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { appointments: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: () => prisma.coupon.count({ where: { deletedAt: null } }),

  create: (data) => prisma.coupon.create({ data }),

  update: (id, data) =>
    prisma.coupon.update({ where: { id }, data }),

  /**
   * Atomically claim one usage of the coupon. Returns the number of rows
   * updated (0 when the usage limit was reached or the coupon is gone/deleted).
   * Pass `db` (a transaction client) when called inside prisma.$transaction.
   */
  incrementUsage: (id, db = prisma) =>
    db.$executeRaw`
      UPDATE coupons
      SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
      WHERE id = ${id}
        AND "deletedAt" IS NULL
        AND ("maxUsage" IS NULL OR "usageCount" < "maxUsage")
    `,

  softDelete: (id, data = {}) =>
    prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date(), ...data },
    }),
};

module.exports = couponRepository;
