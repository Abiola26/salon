'use strict';

const { prisma } = require('../config/db');

const staffRepository = {
  findAll: ({ skip = 0, take = 20, isActive } = {}) =>
    prisma.staff.findMany({
      where: { ...(isActive !== undefined && { isActive }) },
      include: {
        services: { select: { id: true, name: true, duration: true, price: true } },
        _count: { select: { appointments: true } },
      },
      orderBy: { name: 'asc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.staff.count({ where }),

  findById: (id) =>
    prisma.staff.findUnique({
      where: { id },
      include: {
        services: { select: { id: true, name: true, duration: true, price: true } },
        _count: { select: { appointments: true } },
      },
    }),

  findByServiceId: (serviceId) =>
    prisma.staff.findMany({
      where: {
        isActive: true,
        services: { some: { id: serviceId } },
      },
      include: { services: { select: { id: true, name: true } } },
    }),

  create: (data) =>
    prisma.staff.create({
      data,
      include: { services: { select: { id: true, name: true } } },
    }),

  update: (id, data) =>
    prisma.staff.update({
      where: { id },
      data,
      include: { services: { select: { id: true, name: true } } },
    }),

  delete: (id) => prisma.staff.delete({ where: { id } }),
};

module.exports = staffRepository;
