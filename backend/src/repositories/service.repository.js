'use strict';

const { prisma } = require('../config/db');

const serviceRepository = {
  findAll: ({ skip = 0, take = 20, isActive } = {}) =>
    prisma.service.findMany({
      where: {
        deletedAt: null,
        ...(isActive !== undefined && { isActive }),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.service.count({ where: { ...where, deletedAt: null } }),

  findById: (id) => prisma.service.findFirst({ where: { id, deletedAt: null } }),

  findByName: (name) => prisma.service.findFirst({ where: { name, deletedAt: null } }),

  create: (data) => prisma.service.create({ data }),

  update: (id, data) =>
    prisma.service.update({ where: { id }, data }),

  softDelete: (id) =>
    prisma.service.update({ where: { id }, data: { deletedAt: new Date() } }),

  findMostBooked: (limit = 5) =>
    prisma.service.findMany({
      where: { deletedAt: null },
      take: limit,
      orderBy: { appointments: { _count: 'desc' } },
      include: { _count: { select: { appointments: true } } },
    }),
};

module.exports = serviceRepository;
