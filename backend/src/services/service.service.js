'use strict';

const serviceRepository = require('../repositories/service.repository');
const appointmentRepository = require('../repositories/appointment.repository');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');

const serviceService = {
  async getAllServices({ page = 1, limit = 20, isActive } = {}) {
    const skip = (page - 1) * limit;
    const where = isActive !== undefined ? { isActive } : {};
    const [services, total] = await Promise.all([
      serviceRepository.findAll({ skip, take: limit, isActive }),
      serviceRepository.count(where),
    ]);
    return {
      services,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async getServiceById(id) {
    const service = await serviceRepository.findById(id);
    if (!service) throw ApiError.notFound('Service not found');
    return service;
  },

  async createService(dto, actorId = null, ipAddress = null) {
    const existing = await serviceRepository.findByName(dto.name);
    if (existing) throw ApiError.conflict('A service with this name already exists');
    const service = await serviceRepository.create(dto);

    await auditLog({
      userId: actorId,
      action: 'CREATE_SERVICE',
      details: `Created service "${service.name}" (id: ${service.id})`,
      ipAddress,
    });

    return service;
  },

  async updateService(id, dto, actorId = null, ipAddress = null) {
    await serviceService.getServiceById(id);

    if (dto.name) {
      const existing = await serviceRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw ApiError.conflict('A service with this name already exists');
      }
    }

    const updated = await serviceRepository.update(id, dto);

    await auditLog({
      userId: actorId,
      action: 'UPDATE_SERVICE',
      details: `Updated service "${updated.name}" (id: ${id})`,
      ipAddress,
    });

    return updated;
  },

  async deleteService(id, actorId = null, ipAddress = null) {
    const service = await serviceService.getServiceById(id);

    // Guard: reject if there are any linked appointments (RESTRICT FK)
    const linkedCount = await appointmentRepository.count({ serviceId: id });
    if (linkedCount > 0) {
      throw ApiError.conflict(
        `Cannot delete service "${service.name}" — it has ${linkedCount} linked appointment(s). ` +
        'Deactivate the service instead.'
      );
    }

    await serviceRepository.delete(id);

    await auditLog({
      userId: actorId,
      action: 'DELETE_SERVICE',
      details: `Deleted service "${service.name}" (id: ${id})`,
      ipAddress,
    });
  },
};

module.exports = serviceService;
