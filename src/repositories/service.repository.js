'use strict';

const { prisma } = require('../config/db');

const serviceRepository = {
  findAll: ({ skip = 0, take = 20, isActive } = {}) =>
    prisma.service.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.service.count({ where }),

  findById: (id) => prisma.service.findUnique({ where: { id } }),

  findByName: (name) => prisma.service.findFirst({ where: { name } }),

  create: (data) => prisma.service.create({ data }),

  update: (id, data) =>
    prisma.service.update({ where: { id }, data }),

  delete: (id) => prisma.service.delete({ where: { id } }),

  findMostBooked: (limit = 5) =>
    prisma.service.findMany({
      take: limit,
      orderBy: { appointments: { _count: 'desc' } },
      include: { _count: { select: { appointments: true } } },
    }),
};

module.exports = serviceRepository;
