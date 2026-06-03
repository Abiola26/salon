'use strict';

const serviceRepository = require('../repositories/service.repository');
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

  async createService(dto) {
    const existing = await serviceRepository.findByName(dto.name);
    if (existing) throw ApiError.conflict('A service with this name already exists');
    return serviceRepository.create(dto);
  },

  async updateService(id, dto) {
    await serviceService.getServiceById(id);

    if (dto.name) {
      const existing = await serviceRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw ApiError.conflict('A service with this name already exists');
      }
    }

    return serviceRepository.update(id, dto);
  },

  async deleteService(id) {
    await serviceService.getServiceById(id);
    await serviceRepository.delete(id);
  },
};

module.exports = serviceService;
