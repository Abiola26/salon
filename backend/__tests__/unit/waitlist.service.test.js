'use strict';

jest.mock('../../src/repositories/waitlist.repository');
jest.mock('../../src/repositories/service.repository');
jest.mock('../../src/repositories/staff.repository');
jest.mock('../../src/utils/audit', () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/email', () => ({
  sendWaitlistJoinedEmail: jest.fn().mockResolvedValue({}),
  sendWaitlistAvailabilityEmail: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const waitlistRepository = require('../../src/repositories/waitlist.repository');
const serviceRepository = require('../../src/repositories/service.repository');
const staffRepository = require('../../src/repositories/staff.repository');
const { auditLog } = require('../../src/utils/audit');
const {
  sendWaitlistJoinedEmail,
  sendWaitlistAvailabilityEmail,
} = require('../../src/utils/email');
const waitlistService = require('../../src/services/waitlist.service');

const dateOffset = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const nextOpenDate = () => {
  let offset = 1;
  while (new Date(`${dateOffset(offset)}T12:00:00.000Z`).getUTCDay() === 0) {
    offset += 1;
  }
  return dateOffset(offset);
};

const nextClosedDate = () => {
  let offset = 1;
  while (new Date(`${dateOffset(offset)}T12:00:00.000Z`).getUTCDay() !== 0) {
    offset += 1;
  }
  return dateOffset(offset);
};

const service = {
  id: 'svc-1',
  name: 'Signature Cut',
  duration: 45,
  price: '50.00',
  isActive: true,
};

const user = { id: 'user-1', name: 'Ada', email: 'ada@example.com', deletedAt: null };

const futureEntry = (overrides = {}) => ({
  id: 'entry-1',
  userId: user.id,
  serviceId: service.id,
  staffId: null,
  preferredDate: `${nextOpenDate()}T00:00:00.000Z`,
  preferredTime: null,
  notes: null,
  status: 'WAITING',
  user,
  service,
  staff: null,
  ...overrides,
});

describe('waitlistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serviceRepository.findById.mockResolvedValue(service);
    staffRepository.findById.mockResolvedValue({
      id: 'staff-1',
      name: 'Sam',
      isActive: true,
      services: [{ id: service.id }],
    });
    waitlistRepository.findActiveDuplicate.mockResolvedValue(null);
    waitlistRepository.create.mockImplementation(async (data) => ({
      id: 'entry-1',
      status: 'WAITING',
      ...data,
      user,
      service,
      staff: null,
    }));
  });

  describe('joinWaitlist', () => {
    it('creates a WAITING entry, trims notes and queues a confirmation email', async () => {
      const preferredDate = nextOpenDate();

      const entry = await waitlistService.joinWaitlist(user.id, {
        serviceId: service.id,
        preferredDate,
        preferredTime: '10:00',
        notes: '  morning please  ',
      });

      expect(waitlistRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          serviceId: service.id,
          staffId: null,
          preferredDate,
          preferredTime: '10:00',
          notes: 'morning please',
        })
      );
      expect(entry.status).toBe('WAITING');
      expect(sendWaitlistJoinedEmail).toHaveBeenCalled();
    });

    it('rejects an inactive or unknown service', async () => {
      serviceRepository.findById.mockResolvedValue({ ...service, isActive: false });

      await expect(
        waitlistService.joinWaitlist(user.id, {
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(waitlistRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a past or closed date', async () => {
      await expect(
        waitlistService.joinWaitlist(user.id, {
          serviceId: service.id,
          preferredDate: dateOffset(-2),
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        waitlistService.joinWaitlist(user.id, {
          serviceId: service.id,
          preferredDate: nextClosedDate(),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('validates the preferred stylist offers the service', async () => {
      staffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        isActive: true,
        services: [{ id: 'other-service' }],
      });

      await expect(
        waitlistService.joinWaitlist(user.id, {
          serviceId: service.id,
          staffId: 'staff-1',
          preferredDate: nextOpenDate(),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a preferred time outside the service hours', async () => {
      await expect(
        waitlistService.joinWaitlist(user.id, {
          serviceId: service.id,
          preferredDate: nextOpenDate(),
          preferredTime: '17:30',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects duplicate active requests for the same service/date', async () => {
      waitlistRepository.findActiveDuplicate.mockResolvedValue({ id: 'existing' });

      await expect(
        waitlistService.joinWaitlist(user.id, {
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('getAdminWaitlist', () => {
    it('paginates entries and maps status summary counts', async () => {
      waitlistRepository.findAll.mockResolvedValue([futureEntry()]);
      waitlistRepository.count.mockResolvedValue(21);
      waitlistRepository.getStatusCounts.mockResolvedValue([
        { status: 'WAITING', _count: { _all: 4 } },
        { status: 'NOTIFIED', _count: { _all: 2 } },
        { status: 'CONVERTED', _count: { _all: 1 } },
        { status: 'CANCELLED', _count: { _all: 3 } },
      ]);

      const result = await waitlistService.getAdminWaitlist({
        page: 2,
        limit: 10,
        status: 'WAITING',
      });

      expect(waitlistRepository.findAll).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        status: 'WAITING',
        date: undefined,
      });
      expect(result.entries).toHaveLength(1);
      expect(result.summary).toEqual({
        waiting: 4,
        notified: 2,
        converted: 1,
        cancelled: 3,
        total: 10,
      });
      expect(result.meta).toEqual({ total: 21, page: 2, limit: 10, totalPages: 3 });
    });
  });

  describe('notifyEntry', () => {
    it('marks a waiting entry notified, emails it and audits the admin action', async () => {
      waitlistRepository.findById.mockResolvedValue(futureEntry());
      waitlistRepository.markNotified.mockResolvedValue({ count: 1 });

      const result = await waitlistService.notifyEntry('entry-1', 'admin-1', '127.0.0.1');

      expect(waitlistRepository.markNotified).toHaveBeenCalledWith('entry-1', {
        allowResend: true,
      });
      expect(sendWaitlistAvailabilityEmail).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'NOTIFY_WAITLIST', userId: 'admin-1' })
      );
      expect(result.id).toBe('entry-1');
    });

    it('refuses converted/cancelled entries and past dates', async () => {
      waitlistRepository.findById.mockResolvedValueOnce(
        futureEntry({ status: 'CONVERTED' })
      );
      await expect(waitlistService.notifyEntry('entry-1')).rejects.toMatchObject({
        statusCode: 400,
      });

      waitlistRepository.findById.mockResolvedValueOnce(
        futureEntry({ preferredDate: `${dateOffset(-1)}T00:00:00.000Z` })
      );
      await expect(waitlistService.notifyEntry('entry-1')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('returns 409 when another process already claimed the entry', async () => {
      waitlistRepository.findById.mockResolvedValue(futureEntry());
      waitlistRepository.markNotified.mockResolvedValue({ count: 0 });

      await expect(waitlistService.notifyEntry('entry-1')).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(sendWaitlistAvailabilityEmail).not.toHaveBeenCalled();
    });
  });

  describe('notifyNextForSlot', () => {
    it('notifies the oldest matching entry for a freed slot', async () => {
      const entry = futureEntry({ preferredTime: '10:00' });
      waitlistRepository.findNextWaiting.mockResolvedValue(entry);
      waitlistRepository.markNotified.mockResolvedValue({ count: 1 });

      const notified = await waitlistService.notifyNextForSlot({
        serviceId: service.id,
        preferredDate: nextOpenDate(),
        staffId: 'staff-1',
        appointmentTime: '10:00',
      });

      expect(waitlistRepository.findNextWaiting).toHaveBeenCalledWith({
        serviceId: service.id,
        preferredDate: nextOpenDate(),
        staffId: 'staff-1',
        appointmentTime: '10:00',
      });
      expect(notified).toBe(entry);
      expect(sendWaitlistAvailabilityEmail).toHaveBeenCalled();
    });

    it('skips past dates, missing matches and races without throwing', async () => {
      expect(
        await waitlistService.notifyNextForSlot({
          serviceId: service.id,
          preferredDate: dateOffset(-1),
        })
      ).toBeNull();

      waitlistRepository.findNextWaiting.mockResolvedValue(null);
      expect(
        await waitlistService.notifyNextForSlot({
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).toBeNull();

      waitlistRepository.findNextWaiting.mockResolvedValue(futureEntry());
      waitlistRepository.markNotified.mockResolvedValue({ count: 0 });
      expect(
        await waitlistService.notifyNextForSlot({
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).toBeNull();
    });

    it('logs and swallows repository failures', async () => {
      waitlistRepository.findNextWaiting.mockRejectedValue(new Error('db down'));

      await expect(
        waitlistService.notifyNextForSlot({
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).resolves.toBeNull();
    });
  });

  describe('cancelEntry', () => {
    it('lets the owner cancel an active entry', async () => {
      waitlistRepository.findById.mockResolvedValue(futureEntry());
      waitlistRepository.markCancelled.mockResolvedValue({ count: 1 });

      const result = await waitlistService.cancelEntry('entry-1', user.id, 'CUSTOMER');

      expect(waitlistRepository.markCancelled).toHaveBeenCalledWith('entry-1');
      expect(result.id).toBe('entry-1');
    });

    it('rejects another customer and already finished entries', async () => {
      waitlistRepository.findById.mockResolvedValue(futureEntry());
      await expect(
        waitlistService.cancelEntry('entry-1', 'intruder', 'CUSTOMER')
      ).rejects.toMatchObject({ statusCode: 403 });

      waitlistRepository.findById.mockResolvedValue(futureEntry());
      waitlistRepository.markCancelled.mockResolvedValue({ count: 0 });
      await expect(
        waitlistService.cancelEntry('entry-1', user.id, 'CUSTOMER')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('allows admins to cancel any active entry', async () => {
      waitlistRepository.findById.mockResolvedValue(futureEntry());
      waitlistRepository.markCancelled.mockResolvedValue({ count: 1 });

      await expect(
        waitlistService.cancelEntry('entry-1', 'admin-1', 'ADMIN')
      ).resolves.toMatchObject({ id: 'entry-1' });
    });
  });

  describe('markConvertedForBooking', () => {
    it('converts active entries after booking', async () => {
      waitlistRepository.markConverted.mockResolvedValue({ count: 1 });

      await expect(
        waitlistService.markConvertedForBooking({
          userId: user.id,
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).resolves.toBe(1);
    });

    it('never fails a booking when the cleanup update fails', async () => {
      waitlistRepository.markConverted.mockRejectedValue(new Error('db down'));

      await expect(
        waitlistService.markConvertedForBooking({
          userId: user.id,
          serviceId: service.id,
          preferredDate: nextOpenDate(),
        })
      ).resolves.toBe(0);
    });
  });
});
