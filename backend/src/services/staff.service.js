'use strict';

const staffRepository = require('../repositories/staff.repository');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');

const staffService = {
  async getAllStaff({ page = 1, limit = 20, isActive } = {}) {
    const skip = (page - 1) * limit;
    const [staff, total] = await Promise.all([
      staffRepository.findAll({ skip, take: limit, isActive }),
      staffRepository.count(isActive !== undefined ? { isActive } : {}),
    ]);
    return { staff, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  async getStaffById(id) {
    const staff = await staffRepository.findById(id);
    if (!staff) throw ApiError.notFound('Staff member not found');
    return staff;
  },

  async getStaffByService(serviceId) {
    const staff = await staffRepository.findByServiceId(serviceId);
    return staff;
  },

  async createStaff(dto, actorId = null, ipAddress = null) {
    const { serviceIds, ...staffData } = dto;

    const staff = await staffRepository.create({
      ...staffData,
      ...(serviceIds?.length && {
        services: { connect: serviceIds.map((id) => ({ id })) },
      }),
    });

    await auditLog({
      userId: actorId,
      action: 'CREATE_STAFF',
      details: `Created staff member: ${staff.name} (${staff.id})`,
      ipAddress,
    });

    return staff;
  },

  async updateStaff(id, dto, actorId = null, ipAddress = null) {
    const existing = await staffRepository.findById(id);
    if (!existing) throw ApiError.notFound('Staff member not found');

    const { serviceIds, ...staffData } = dto;

    const updated = await staffRepository.update(id, {
      ...staffData,
      ...(serviceIds !== undefined && {
        services: { set: serviceIds.map((sid) => ({ id: sid })) },
      }),
    });

    await auditLog({
      userId: actorId,
      action: 'UPDATE_STAFF',
      details: `Updated staff member: ${updated.name} (${id})`,
      ipAddress,
    });

    return updated;
  },

  async deleteStaff(id, actorId = null, ipAddress = null) {
    const existing = await staffRepository.findById(id);
    if (!existing) throw ApiError.notFound('Staff member not found');

    await staffRepository.delete(id);

    await auditLog({
      userId: actorId,
      action: 'DELETE_STAFF',
      details: `Deleted staff member: ${existing.name} (${id})`,
      ipAddress,
    });
  },
};

module.exports = staffService;
