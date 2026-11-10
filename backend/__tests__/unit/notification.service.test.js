'use strict';

jest.mock('../../src/repositories/notification.repository');
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const notificationRepository = require('../../src/repositories/notification.repository');
const notificationService = require('../../src/services/notification.service');

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSummary', () => {
    it('maps queue status counts and reminder stats', async () => {
      notificationRepository.getQueueStatusCounts.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 4 } },
        { status: 'SENT', _count: { _all: 10 } },
        { status: 'FAILED', _count: { _all: 2 } },
      ]);
      notificationRepository.getRecentFailures.mockResolvedValue([
        { id: 'failed-1', status: 'FAILED' },
      ]);
      notificationRepository.getReminderStats.mockResolvedValue({
        upcomingAppointments: 9,
        email: { sent: 3, pending: 6, optedOut: 0 },
        sms: { sent: 1, pending: 7, optedOut: 1, missingPhone: 1 },
      });

      const summary = await notificationService.getSummary({
        now: new Date('2026-06-29T13:00:00.000Z'),
      });

      expect(notificationRepository.getReminderStats).toHaveBeenCalledWith({
        from: '2026-06-29',
        to: '2026-07-06',
      });
      expect(summary.emailQueue).toEqual({
        pending: 4,
        sent: 10,
        failed: 2,
        total: 16,
      });
      expect(summary.reminders.rangeDays).toBe(7);
      expect(summary.reminders.sms.missingPhone).toBe(1);
      expect(summary.recentFailures).toHaveLength(1);
    });

    it('ignores unknown queue statuses but still totals them', async () => {
      notificationRepository.getQueueStatusCounts.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 1 } },
        { status: 'QUEUED', _count: { _all: 2 } },
      ]);
      notificationRepository.getRecentFailures.mockResolvedValue([]);
      notificationRepository.getReminderStats.mockResolvedValue({
        upcomingAppointments: 0,
        email: { sent: 0, pending: 0, optedOut: 0 },
        sms: { sent: 0, pending: 0, optedOut: 0, missingPhone: 0 },
      });

      const summary = await notificationService.getSummary();

      expect(summary.emailQueue).toEqual({
        pending: 1,
        sent: 0,
        failed: 0,
        total: 3,
      });
    });
  });

  describe('getQueue', () => {
    it('paginates and filters the email queue', async () => {
      notificationRepository.getQueue.mockResolvedValue([{ id: 'one' }]);
      notificationRepository.countQueue.mockResolvedValue(21);

      const result = await notificationService.getQueue({
        page: 2,
        limit: 10,
        status: 'FAILED',
      });

      expect(notificationRepository.getQueue).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        status: 'FAILED',
      });
      expect(notificationRepository.countQueue).toHaveBeenCalledWith('FAILED');
      expect(result).toEqual({
        notifications: [{ id: 'one' }],
        meta: { total: 21, page: 2, limit: 10, totalPages: 3 },
      });
    });
  });
});
