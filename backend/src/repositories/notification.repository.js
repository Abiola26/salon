'use strict';

const { prisma } = require('../config/db');

const QUEUE_SELECT = {
  id: true,
  to: true,
  subject: true,
  status: true,
  attempts: true,
  lastError: true,
  createdAt: true,
};

const notificationRepository = {
  getQueue: ({ skip = 0, take = 20, status } = {}) =>
    prisma.emailQueue.findMany({
      where: status ? { status } : {},
      select: QUEUE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),

  countQueue: (status) =>
    prisma.emailQueue.count({ where: status ? { status } : {} }),

  getQueueStatusCounts: () =>
    prisma.emailQueue.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),

  getRecentFailures: (take = 5) =>
    prisma.emailQueue.findMany({
      where: { status: 'FAILED' },
      select: QUEUE_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
    }),

  getReminderStats: async ({ from, to }) => {
    const base = {
      appointmentDate: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${to}T00:00:00.000Z`),
      },
      status: { in: ['PENDING', 'CONFIRMED'] },
    };

    const [
      upcomingAppointments,
      emailSent,
      emailPending,
      emailOptedOut,
      smsSent,
      smsPending,
      smsOptedOut,
      smsMissingPhone,
    ] = await Promise.all([
      prisma.appointment.count({ where: base }),
      prisma.appointment.count({
        where: { ...base, emailReminderSentAt: { not: null } },
      }),
      prisma.appointment.count({
        where: {
          ...base,
          emailReminderSentAt: null,
          user: { emailReminders: true, deletedAt: null },
        },
      }),
      prisma.appointment.count({
        where: { ...base, user: { emailReminders: false, deletedAt: null } },
      }),
      prisma.appointment.count({
        where: { ...base, smsReminderSentAt: { not: null } },
      }),
      prisma.appointment.count({
        where: {
          ...base,
          smsReminderSentAt: null,
          user: { smsReminders: true, deletedAt: null, phoneNumber: { not: null } },
        },
      }),
      prisma.appointment.count({
        where: { ...base, user: { smsReminders: false, deletedAt: null } },
      }),
      prisma.appointment.count({
        where: {
          ...base,
          smsReminderSentAt: null,
          user: { smsReminders: true, deletedAt: null, phoneNumber: null },
        },
      }),
    ]);

    return {
      upcomingAppointments,
      email: { sent: emailSent, pending: emailPending, optedOut: emailOptedOut },
      sms: {
        sent: smsSent,
        pending: smsPending,
        optedOut: smsOptedOut,
        missingPhone: smsMissingPhone,
      },
    };
  },
};

module.exports = notificationRepository;
