'use strict';

const { prisma } = require('../config/db');

const appointmentRepository = {
  findById: (id) =>
    prisma.appointment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        service: true,
        staff: { select: { id: true, name: true } },
        coupon: { select: { id: true, code: true, discountType: true, discountValue: true } },
      },
    }),

  findByIdRaw: (id) => prisma.appointment.findUnique({ where: { id } }),

  findAll: ({ skip = 0, take = 20, userId, status, paymentStatus, date } = {}) =>
    prisma.appointment.findMany({
      where: {
        ...(userId && { userId }),
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
        ...(date && {
          appointmentDate: {
            gte: new Date(date),
            lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
          },
        }),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        service: { select: { id: true, name: true, duration: true, price: true } },
        staff: { select: { id: true, name: true } },
        coupon: { select: { id: true, code: true, discountType: true, discountValue: true } },
      },
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'asc' }],
      skip,
      take,
    }),

  count: (where = {}) => prisma.appointment.count({ where }),

  create: (data) =>
    prisma.appointment.create({
      data,
      include: {
        service: true,
        staff: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),

  update: (id, data) =>
    prisma.appointment.update({
      where: { id },
      data,
      include: {
        service: true,
        staff: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),

  delete: (id) => prisma.appointment.delete({ where: { id } }),

  /**
   * Check if a slot is already taken (exclude CANCELLED slots and optionally an appointment id)
   * If staffId is provided, only conflicts for that stylist are checked.
   * If staffId is null, checks ALL appointments regardless of staff.
   */
  checkSlotConflict: (appointmentDate, appointmentTime, excludeId = null, staffId = null) =>
    prisma.appointment.findFirst({
      where: {
        appointmentDate: new Date(appointmentDate),
        appointmentTime,
        status: { not: 'CANCELLED' },
        ...(staffId !== undefined && staffId !== null && { staffId }),
        ...(excludeId && { id: { not: excludeId } }),
      },
    }),

  findUpcomingForUser: (userId) =>
    prisma.appointment.findMany({
      where: {
        userId,
        appointmentDate: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: { service: true },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    }),

  getTotalRevenue: () =>
    prisma.appointment.aggregate({ _sum: { amountPaid: true } }),

  getMonthlyRevenue: (year) =>
    prisma.$queryRaw`
      SELECT
        EXTRACT(MONTH FROM "appointmentDate")::int AS month,
        SUM("amountPaid")::float AS revenue,
        COUNT(*)::int AS count
      FROM appointments
      WHERE EXTRACT(YEAR FROM "appointmentDate") = ${year}
        AND status != 'CANCELLED'
      GROUP BY month
      ORDER BY month
    `,

  getCountByStatus: () =>
    prisma.appointment.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

  /**
   * Return all booked (non-cancelled) appointment times for a specific date.
   * If staffId provided, only that stylist's bookings are returned.
   */
  findBookedSlots: (date, staffId = null) =>
    prisma.appointment.findMany({
      where: {
        appointmentDate: new Date(date),
        status: { not: 'CANCELLED' },
        ...(staffId !== null && { staffId }),
      },
      select: { appointmentTime: true, service: { select: { duration: true } } },
    }),
};

module.exports = appointmentRepository;
