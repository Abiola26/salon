'use strict';

const { prisma } = require('../config/db');

const reviewRepository = {
  findById: (id) =>
    prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
    }),

  findByAppointmentId: (appointmentId) =>
    prisma.review.findUnique({ where: { appointmentId } }),

  findAll: ({ skip = 0, take = 20, serviceId, userId } = {}) =>
    prisma.review.findMany({
      where: {
        ...(serviceId && { serviceId }),
        ...(userId && { userId }),
      },
      include: {
        user: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  count: (where = {}) => prisma.review.count({ where }),

  create: (data) =>
    prisma.review.create({
      data,
      include: {
        user: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
    }),

  delete: (id) => prisma.review.delete({ where: { id } }),

  getAverageRating: (serviceId) =>
    prisma.review.aggregate({
      where: { serviceId },
      _avg: { rating: true },
      _count: { rating: true },
    }),

  getOverallAverageRating: () =>
    prisma.review.aggregate({
      _avg: { rating: true },
      _count: { rating: true },
    }),
};

module.exports = reviewRepository;
