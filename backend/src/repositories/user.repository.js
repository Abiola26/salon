'use strict';

const { prisma } = require('../config/db');

const userRepository = {
  findById: (id) =>
    prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, role: true, loyaltyPoints: true, createdAt: true, updatedAt: true },
    }),

  findByIdFull: (id) => prisma.user.findUnique({ where: { id } }),

  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),

  findAll: ({ skip = 0, take = 20, role } = {}) =>
    prisma.user.findMany({
      where: role ? { role } : undefined,
      select: { id: true, name: true, email: true, phone: true, role: true, loyaltyPoints: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.user.count({ where }),

  create: (data) =>
    prisma.user.create({
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    }),

  update: (id, data) =>
    prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, updatedAt: true },
    }),

  updateByEmail: (email, data) =>
    prisma.user.update({ where: { email }, data }),

  delete: (id) => prisma.user.delete({ where: { id } }),

  findByResetToken: (hashedToken) =>
    prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: { gt: new Date() },
      },
    }),
};

module.exports = userRepository;
