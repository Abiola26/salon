'use strict';

const { prisma } = require('../config/db');

const toDate = (value) =>
  value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

const ENTRY_INCLUDE = {
  user: { select: { id: true, name: true, email: true, deletedAt: true } },
  service: { select: { id: true, name: true, duration: true, price: true } },
  staff: { select: { id: true, name: true } },
};

const waitlistRepository = {
  create: (data) =>
    prisma.waitlistEntry.create({
      data: { ...data, preferredDate: toDate(data.preferredDate) },
      include: ENTRY_INCLUDE,
    }),

  findById: (id) =>
    prisma.waitlistEntry.findUnique({ where: { id }, include: ENTRY_INCLUDE }),

  findActiveDuplicate: (userId, serviceId, preferredDate) =>
    prisma.waitlistEntry.findFirst({
      where: {
        userId,
        serviceId,
        preferredDate: toDate(preferredDate),
        status: { in: ['WAITING', 'NOTIFIED'] },
      },
    }),

  findByUser: (userId) =>
    prisma.waitlistEntry.findMany({
      where: { userId },
      include: ENTRY_INCLUDE,
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
    }),

  findAll: ({ skip = 0, take = 20, status, date } = {}) =>
    prisma.waitlistEntry.findMany({
      where: {
        ...(status && { status }),
        ...(date && { preferredDate: toDate(date) }),
      },
      include: ENTRY_INCLUDE,
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
      skip,
      take,
    }),

  count: ({ status, date } = {}) =>
    prisma.waitlistEntry.count({
      where: {
        ...(status && { status }),
        ...(date && { preferredDate: toDate(date) }),
      },
    }),

  getStatusCounts: () =>
    prisma.waitlistEntry.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),

  // Oldest active entry that could take the freed slot. A null entry.staffId
  // means "any stylist"; a null freed staffId (no preference on the cancelled
  // booking) can only satisfy any-stylist entries.
  findNextWaiting: ({ serviceId, preferredDate, staffId = null, appointmentTime = null }) => {
    const and = [
      {
        OR: staffId
          ? [{ staffId: null }, { staffId }]
          : [{ staffId: null }],
      },
    ];
    if (appointmentTime) {
      and.push({
        OR: [{ preferredTime: null }, { preferredTime: appointmentTime }],
      });
    }

    return prisma.waitlistEntry.findFirst({
      where: {
        serviceId,
        preferredDate: toDate(preferredDate),
        status: 'WAITING',
        user: { deletedAt: null },
        AND: and,
      },
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  },

  markNotified: (id, { allowResend = false } = {}) =>
    prisma.waitlistEntry.updateMany({
      where: {
        id,
        status: allowResend ? { in: ['WAITING', 'NOTIFIED'] } : 'WAITING',
      },
      data: { status: 'NOTIFIED', notifiedAt: new Date() },
    }),

  markConverted: ({ userId, serviceId, preferredDate }) =>
    prisma.waitlistEntry.updateMany({
      where: {
        userId,
        serviceId,
        preferredDate: toDate(preferredDate),
        status: { in: ['WAITING', 'NOTIFIED'] },
      },
      data: { status: 'CONVERTED' },
    }),

  markCancelled: (id) =>
    prisma.waitlistEntry.updateMany({
      where: { id, status: { in: ['WAITING', 'NOTIFIED'] } },
      data: { status: 'CANCELLED' },
    }),
};

module.exports = waitlistRepository;
