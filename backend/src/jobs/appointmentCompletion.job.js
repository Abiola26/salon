'use strict';

const { prisma } = require('../config/db');
const { salonDateString, appointmentEndAt } = require('../utils/salonTime');

const completePastAppointments = async ({ now = new Date(), db = prisma } = {}) => {
  const today = salonDateString(now);

  const candidates = await db.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      appointmentDate: { lte: new Date(`${today}T00:00:00.000Z`) },
    },
    select: {
      id: true,
      appointmentDate: true,
      appointmentTime: true,
      service: { select: { duration: true } },
    },
  });

  let completed = 0;
  for (const appointment of candidates) {
    const endAt = appointmentEndAt(
      appointment,
      appointment.service?.duration || 0
    );
    if (endAt.getTime() > now.getTime()) continue;

    const result = await db.appointment.updateMany({
      where: { id: appointment.id, status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });
    completed += result.count;
  }

  return { completed, checked: candidates.length };
};

module.exports = { completePastAppointments };
