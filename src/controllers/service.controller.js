'use strict';

const serviceService = require('../services/service.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const serviceController = {
  getAllServices: asyncHandler(async (req, res) => {
    const { page, limit, isActive } = req.query;
    const result = await serviceService.getAllServices({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
    return ApiResponse.ok(res, 'Services retrieved successfully', result.services, result.meta);
  }),

  getServiceById: asyncHandler(async (req, res) => {
    const service = await serviceService.getServiceById(req.params.id);
    return ApiResponse.ok(res, 'Service retrieved successfully', service);
  }),

  createService: asyncHandler(async (req, res) => {
    const service = await serviceService.createService(req.body);
    return ApiResponse.created(res, 'Service created successfully', service);
  }),

  updateService: asyncHandler(async (req, res) => {
    const service = await serviceService.updateService(req.params.id, req.body);
    return ApiResponse.ok(res, 'Service updated successfully', service);
  }),

  deleteService: asyncHandler(async (req, res) => {
    await serviceService.deleteService(req.params.id);
    return ApiResponse.ok(res, 'Service deleted successfully');
  }),
};

module.exports = serviceController;
