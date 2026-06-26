'use strict';

const serviceService = require('../../src/services/service.service');
const serviceRepository = require('../../src/repositories/service.repository');
const appointmentRepository = require('../../src/repositories/appointment.repository');
const { auditLog } = require('../../src/utils/audit');

jest.mock('../../src/repositories/service.repository');
jest.mock('../../src/repositories/appointment.repository');
jest.mock('../../src/utils/audit');

describe('serviceService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getAllServices', () => {
    it('returns list of services with metadata', async () => {
      const services = [{ id: 's1', name: 'Haircut' }];
      serviceRepository.findAll.mockResolvedValue(services);
      serviceRepository.count.mockResolvedValue(1);

      const result = await serviceService.getAllServices({ page: 1, limit: 10, isActive: true });

      expect(result.services).toEqual(services);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('getServiceById', () => {
    it('throws when service not found', async () => {
      serviceRepository.findById.mockResolvedValue(null);

      await expect(serviceService.getServiceById('s1')).rejects.toThrow('Service not found');
    });

    it('returns service when found', async () => {
      const service = { id: 's1', name: 'Haircut' };
      serviceRepository.findById.mockResolvedValue(service);

      const result = await serviceService.getServiceById('s1');
      expect(result).toEqual(service);
    });
  });

  describe('createService', () => {
    it('throws when name already exists', async () => {
      serviceRepository.findByName.mockResolvedValue({ id: 's2', name: 'Haircut' });

      await expect(serviceService.createService({ name: 'Haircut' })).rejects.toThrow(
        'A service with this name already exists'
      );
    });

    it('creates service and logs audit', async () => {
      serviceRepository.findByName.mockResolvedValue(null);
      serviceRepository.create.mockResolvedValue({ id: 's1', name: 'Haircut' });
      auditLog.mockResolvedValue({});

      const result = await serviceService.createService({ name: 'Haircut' }, 'admin-1', '127.0.0.1');

      expect(result.name).toBe('Haircut');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_SERVICE' }));
    });
  });

  describe('updateService', () => {
    it('throws when service is not found', async () => {
      serviceRepository.findById.mockResolvedValue(null);

      await expect(serviceService.updateService('s1', { name: 'Trim' })).rejects.toThrow('Service not found');
    });

    it('throws when update name matches another existing service', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', name: 'Haircut' });
      serviceRepository.findByName.mockResolvedValue({ id: 's2', name: 'Trim' }); // another service has name 'Trim'

      await expect(serviceService.updateService('s1', { name: 'Trim' })).rejects.toThrow(
        'A service with this name already exists'
      );
    });

    it('updates service name successfully if name is unique', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', name: 'Haircut' });
      serviceRepository.findByName.mockResolvedValue(null);
      serviceRepository.update.mockResolvedValue({ id: 's1', name: 'Trim' });

      const result = await serviceService.updateService('s1', { name: 'Trim' });
      expect(result.name).toBe('Trim');
    });
  });

  describe('deleteService', () => {
    it('throws when service has linked appointments', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', name: 'Haircut' });
      appointmentRepository.count.mockResolvedValue(5);

      await expect(serviceService.deleteService('s1')).rejects.toThrow(
        'Cannot delete service "Haircut" — it has 5 linked appointment(s)'
      );
    });

    it('deletes service successfully when no appointments are linked', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', name: 'Haircut' });
      appointmentRepository.count.mockResolvedValue(0);
      serviceRepository.delete.mockResolvedValue({});
      auditLog.mockResolvedValue({});

      await serviceService.deleteService('s1', 'admin-1', '127.0.0.1');

      expect(serviceRepository.delete).toHaveBeenCalledWith('s1');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_SERVICE' }));
    });
  });
});
