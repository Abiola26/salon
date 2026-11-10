'use strict';

const notificationRepository = require('../repositories/notification.repository');
const { salonDateString, addDaysToDateString } = require('../utils/salonTime');

const REMINDER_WINDOW_DAYS = 7;

const notificationService = {
  async getSummary({ now = new Date() } = {}) {
    const from = salonDateString(now);
    const to = addDaysToDateString(from, REMINDER_WINDOW_DAYS);

    const [statusCounts, recentFailures, reminders] = await Promise.all([
      notificationRepository.getQueueStatusCounts(),
      notificationRepository.getRecentFailures(5),
      notificationRepository.getReminderStats({ from, to }),
    ]);

    const emailQueue = { pending: 0, sent: 0, failed: 0, total: 0 };
    for (const row of statusCounts) {
      const key = row.status.toLowerCase();
      if (key in emailQueue) emailQueue[key] = row._count._all;
      emailQueue.total += row._count._all;
    }

    return {
      emailQueue,
      reminders: { rangeDays: REMINDER_WINDOW_DAYS, ...reminders },
      recentFailures,
    };
  },

  async getQueue({ page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      notificationRepository.getQueue({ skip, take: limit, status }),
      notificationRepository.countQueue(status),
    ]);

    return {
      notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },
};

module.exports = notificationService;
