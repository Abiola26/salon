'use strict';

const staffService = require('../../src/services/staff.service');
const staffRepository = require('../../src/repositories/staff.repository');
const { auditLog } = require('../../src/utils/audit');

jest.mock('../../src/repositories/staff.repository');
jest.mock('../../src/utils/audit');

describe('staffService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getAllStaff', () => {
    it('returns paginated list of staff members', async () => {
      const staffList = [{ id: 'st1', name: 'John' }];
      staffRepository.findAll.mockResolvedValue(staffList);
      staffRepository.count.mockResolvedValue(1);

      const result = await staffService.getAllStaff({ page: 1, limit: 10 });
      expect(result.staff).toEqual(staffList);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('getStaffById', () => {
    it('throws when staff member not found', async () => {
      staffRepository.findById.mockResolvedValue(null);

      await expect(staffService.getStaffById('st1')).rejects.toThrow('Staff member not found');
    });

    it('returns staff member when found', async () => {
      const staff = { id: 'st1', name: 'John' };
      staffRepository.findById.mockResolvedValue(staff);

      const result = await staffService.getStaffById('st1');
      expect(result).toEqual(staff);
    });
  });

  describe('getStaffByService', () => {
    it('returns staff offering a service', async () => {
      const staffList = [{ id: 'st1', name: 'John' }];
      staffRepository.findByServiceId.mockResolvedValue(staffList);

      const result = await staffService.getStaffByService('s1');
      expect(result).toEqual(staffList);
    });
  });

  describe('createStaff', () => {
    it('creates staff without service connections', async () => {
      staffRepository.create.mockResolvedValue({ id: 'st1', name: 'John' });
      auditLog.mockResolvedValue({});

      const result = await staffService.createStaff({ name: 'John' }, 'admin-1', '127.0.0.1');
      expect(result.name).toBe('John');
      expect(staffRepository.create).toHaveBeenCalledWith({ name: 'John' });
    });

    it('creates staff with connected service ids', async () => {
      staffRepository.create.mockResolvedValue({ id: 'st1', name: 'John' });
      auditLog.mockResolvedValue({});

      await staffService.createStaff({ name: 'John', serviceIds: ['s1', 's2'] });

      expect(staffRepository.create).toHaveBeenCalledWith({
        name: 'John',
        services: { connect: [{ id: 's1' }, { id: 's2' }] },
      });
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_STAFF' }));
    });
  });

  describe('updateStaff', () => {
    it('throws when staff member is not found', async () => {
      staffRepository.findById.mockResolvedValue(null);

      await expect(staffService.updateStaff('st1', { name: 'trim' })).rejects.toThrow('Staff member not found');
    });

    it('updates staff member and logs audit', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', name: 'John' });
      staffRepository.update.mockResolvedValue({ id: 'st1', name: 'Johnny' });
      auditLog.mockResolvedValue({});

      const result = await staffService.updateStaff('st1', { name: 'Johnny', serviceIds: ['s1'] });

      expect(result.name).toBe('Johnny');
      expect(staffRepository.update).toHaveBeenCalledWith('st1', {
        name: 'Johnny',
        services: { set: [{ id: 's1' }] },
      });
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE_STAFF' }));
    });
  });

  describe('deleteStaff', () => {
    it('throws when staff member not found', async () => {
      staffRepository.findById.mockResolvedValue(null);

      await expect(staffService.deleteStaff('st1')).rejects.toThrow('Staff member not found');
    });

    it('deletes staff member and logs audit', async () => {
      staffRepository.findById.mockResolvedValue({ id: 'st1', name: 'John' });
      staffRepository.delete.mockResolvedValue({});
      auditLog.mockResolvedValue({});

      await staffService.deleteStaff('st1', 'admin-1', '127.0.0.1');

      expect(staffRepository.delete).toHaveBeenCalledWith('st1');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_STAFF' }));
    });
  });
});
