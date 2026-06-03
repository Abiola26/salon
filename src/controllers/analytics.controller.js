'use strict';

const analyticsService = require('../services/analytics.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const analyticsController = {
  getDashboard: asyncHandler(async (req, res) => {
    const data = await analyticsService.getDashboard();
    return ApiResponse.ok(res, 'Dashboard data retrieved successfully', data);
  }),
};

module.exports = analyticsController;
