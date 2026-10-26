'use strict';

const staffLeaveService = require('../../src/services/staffLeave.service');
const staffLeaveRepository = require('../../src/repositories/staffLeave.repository');
const staffRepository = require('../../src/repositories/staff.repository');
const { prisma } = require('../../src/config/db');
const { auditLog } = require('../../src/utils/audit');

jest.mock('../../src/repositories/staffLeave.repository');
jest.mock('../../src/repositories/staff.repository');
jest.mock('../../src/config/db', () => {
  const prisma = {
    $executeRaw: jest.fn(),
    // Plain function survives jest.resetAllMocks()
    $transaction: async (fn) => fn(prisma),
  };
  return { prisma };
});
jest.mock('../../src/utils/audit');

describe('staffLeaveService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auditLog.mockResolvedValue({});
  });

  describe('getLeaveForStaff', () => {
    it('throws when staff member not found', async () => {
      staffRepository.findById.mockResolvedValue(null);

      await expect(staffLeaveService.getLeaveForStaff('st1')).rejects.toThrow('Staff member not found');
    });

    it('returns leave periods for the stylist', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1' });
      const leave = [{ id: 'lv1', staffId: 'st1' }];
      staffLeaveRepository.findByStaffId.mockResolvedValue(leave);

      const result = await staffLeaveService.getLeaveForStaff('st1');
      expect(result).toEqual(leave);
      expect(staffLeaveRepository.findByStaffId).toHaveBeenCalledWith('st1');
    });
  });

  describe('getAllUpcomingLeave', () => {
    it('returns upcoming leave from the repository', async () => {
      const rows = [{ id: 'lv1', staff: { name: 'John' } }];
      staffLeaveRepository.findAllUpcoming.mockResolvedValue(rows);

      const result = await staffLeaveService.getAllUpcomingLeave();
      expect(result).toEqual(rows);
    });
  });

  describe('createLeave', () => {
    it('throws when staff member is missing or inactive', async () => {
      staffRepository.findById.mockResolvedValue(null);

      await expect(
        staffLeaveService.createLeave('st1', { startDate: '2026-08-10', endDate: '2026-08-11' })
      ).rejects.toThrow('Staff member not found or inactive');

      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: false });

      await expect(
        staffLeaveService.createLeave('st1', { startDate: '2026-08-10', endDate: '2026-08-11' })
      ).rejects.toThrow('Staff member not found or inactive');
    });

    it('rejects ranges longer than 366 days', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true });

      await expect(
        staffLeaveService.createLeave('st1', { startDate: '2026-01-01', endDate: '2028-01-01' })
      ).rejects.toThrow('cannot exceed 366 days');

      expect(staffLeaveRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when an overlapping leave already exists', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true });
      staffLeaveRepository.findOverlapping.mockResolvedValue([{ id: 'lv0' }]);

      await expect(
        staffLeaveService.createLeave('st1', { startDate: '2026-08-10', endDate: '2026-08-11' })
      ).rejects.toThrow('overlaps this range');

      expect(staffLeaveRepository.create).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    });

    it('rejects when live appointments fall inside the range', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true });
      staffLeaveRepository.findOverlapping.mockResolvedValue([]);
      staffLeaveRepository.countAppointmentsIn.mockResolvedValue(3);

      await expect(
        staffLeaveService.createLeave('st1', { startDate: '2026-08-10', endDate: '2026-08-11' })
      ).rejects.toThrow('3 existing appointment(s)');

      expect(staffLeaveRepository.create).not.toHaveBeenCalled();
    });

    it('locks every date in ascending order, creates the leave and audits it', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true, name: 'John' });
      staffLeaveRepository.findOverlapping.mockResolvedValue([]);
      staffLeaveRepository.countAppointmentsIn.mockResolvedValue(0);
      staffLeaveRepository.create.mockResolvedValue({ id: 'lv1', staffId: 'st1' });

      const result = await staffLeaveService.createLeave(
        'st1',
        { startDate: '2026-08-10', endDate: '2026-08-11', reason: 'Vacation' },
        'admin-1',
        '127.0.0.1'
      );

      expect(result.id).toBe('lv1');
      // One advisory lock per date, same key format createAppointment uses
      const lockValues = prisma.$executeRaw.mock.calls.map((call) => call[1]);
      expect(lockValues).toEqual(['salon:booking:2026-08-10', 'salon:booking:2026-08-11']);

      expect(staffLeaveRepository.create).toHaveBeenCalledWith(
        {
          staffId: 'st1',
          startDate: new Date('2026-08-10'),
          endDate: new Date('2026-08-11'),
          reason: 'Vacation',
        },
        expect.anything()
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE_STAFF_LEAVE', userId: 'admin-1' })
      );
    });

    it('normalizes a missing reason to null', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true });
      staffLeaveRepository.findOverlapping.mockResolvedValue([]);
      staffLeaveRepository.countAppointmentsIn.mockResolvedValue(0);
      staffLeaveRepository.create.mockResolvedValue({ id: 'lv2' });

      await staffLeaveService.createLeave('st1', { startDate: '2026-09-01', endDate: '2026-09-01' });

      expect(staffLeaveRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null }),
        expect.anything()
      );
    });
  });

  describe('deleteLeave', () => {
    it('throws when the leave period does not exist', async () => {
      staffLeaveRepository.findById.mockResolvedValue(null);

      await expect(staffLeaveService.deleteLeave('lv1')).rejects.toThrow('Leave period not found');
      expect(staffLeaveRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes the leave period and audits it', async () => {
      staffLeaveRepository.findById.mockResolvedValue({ id: 'lv1', staffId: 'st1' });
      staffLeaveRepository.delete.mockResolvedValue({ id: 'lv1' });

      await staffLeaveService.deleteLeave('lv1', 'admin-1', '127.0.0.1');

      expect(staffLeaveRepository.delete).toHaveBeenCalledWith('lv1');
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE_STAFF_LEAVE', userId: 'admin-1' })
      );
    });
  });
});
