'use strict';

const { prisma } = require('../config/db');

const toDate = (d) => (typeof d === 'string' ? new Date(d) : d);

const staffLeaveRepository = {
  // Leave rows overlapping [startDate, endDate] (inclusive) for one stylist
  findOverlapping: (staffId, startDate, endDate, db = prisma) =>
    db.staffLeave.findMany({
      where: { staffId, startDate: { lte: endDate }, endDate: { gte: startDate } },
      orderBy: { startDate: 'asc' },
    }),

  // Non-cancelled appointments for a stylist inside a date range — used to
  // refuse leave that would strand existing bookings.
  countAppointmentsIn: (staffId, startDate, endDate, db = prisma) =>
    db.appointment.count({
      where: {
        staffId,
        appointmentDate: { gte: toDate(startDate), lte: toDate(endDate) },
        status: { not: 'CANCELLED' },
      },
    }),

  // Stylist ids with leave covering a single date (availability + booking checks)
  findStaffIdsOnLeave: (date, db = prisma) =>
    db.staffLeave
      .findMany({
        where: { startDate: { lte: toDate(date) }, endDate: { gte: toDate(date) } },
        select: { staffId: true },
      })
      .then((rows) => rows.map((r) => r.staffId)),

  create: (data, db = prisma) => db.staffLeave.create({ data }),

  findByStaffId: (staffId, db = prisma) =>
    db.staffLeave.findMany({ where: { staffId }, orderBy: { startDate: 'desc' } }),

  // Admin overview: upcoming leave with staff names
  findAllUpcoming: (db = prisma) =>
    db.staffLeave.findMany({
      where: { endDate: { gte: new Date() } },
      include: { staff: { select: { id: true, name: true, isActive: true, deletedAt: true } } },
      orderBy: { startDate: 'asc' },
    }),

  findById: (id, db = prisma) => db.staffLeave.findUnique({ where: { id } }),

  delete: (id, db = prisma) => db.staffLeave.delete({ where: { id } }),
};

module.exports = staffLeaveRepository;
