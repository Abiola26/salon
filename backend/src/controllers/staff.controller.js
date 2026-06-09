'use strict';

const staffService = require('../services/staff.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const staffController = {
  getAllStaff: asyncHandler(async (req, res) => {
    const { page, limit, isActive, serviceId } = req.query;

    if (serviceId) {
      const staff = await staffService.getStaffByService(serviceId);
      return ApiResponse.ok(res, 'Staff retrieved successfully', staff);
    }

    const result = await staffService.getAllStaff({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
    return ApiResponse.ok(res, 'Staff retrieved successfully', result.staff, result.meta);
  }),

  getStaffById: asyncHandler(async (req, res) => {
    const staff = await staffService.getStaffById(req.params.id);
    return ApiResponse.ok(res, 'Staff member retrieved successfully', staff);
  }),

  createStaff: asyncHandler(async (req, res) => {
    const staff = await staffService.createStaff(req.body, req.user?.id, req.ip);
    return ApiResponse.created(res, 'Staff member created successfully', staff);
  }),

  updateStaff: asyncHandler(async (req, res) => {
    const staff = await staffService.updateStaff(req.params.id, req.body, req.user?.id, req.ip);
    return ApiResponse.ok(res, 'Staff member updated successfully', staff);
  }),

  deleteStaff: asyncHandler(async (req, res) => {
    await staffService.deleteStaff(req.params.id, req.user?.id, req.ip);
    return ApiResponse.ok(res, 'Staff member deleted successfully');
  }),
};

module.exports = staffController;
