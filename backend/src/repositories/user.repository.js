'use strict';

const { prisma } = require('../config/db');

const userRepository = {
  findById: (id) =>
    prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, loyaltyPoints: true, createdAt: true, updatedAt: true },
    }),

  findByIdFull: (id) => prisma.user.findFirst({ where: { id, deletedAt: null } }),

  findByEmail: (email) =>
    prisma.user.findFirst({ where: { email, deletedAt: null } }),

  findAll: ({ skip = 0, take = 20, role } = {}) =>
    prisma.user.findMany({
      where: { deletedAt: null, ...(role && { role }) },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, loyaltyPoints: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.user.count({ where: { ...where, deletedAt: null } }),

  create: (data) =>
    prisma.user.create({
      data,
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, createdAt: true },
    }),

  update: (id, data) =>
    prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, updatedAt: true },
    }),

  updateByEmail: (email, data) =>
    prisma.user.update({ where: { email }, data }),

  softDelete: (id, data = {}) =>
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), ...data },
      select: { id: true },
    }),

  findByResetToken: (hashedToken) =>
    prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: { gt: new Date() },
        deletedAt: null,
      },
    }),
};

module.exports = userRepository;
