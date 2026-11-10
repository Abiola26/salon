'use strict';

const notificationService = require('../services/notification.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const notificationController = {
  getSummary: asyncHandler(async (req, res) => {
    const data = await notificationService.getSummary();
    return ApiResponse.ok(res, 'Notification summary retrieved successfully', data);
  }),

  getQueue: asyncHandler(async (req, res) => {
    const data = await notificationService.getQueue(req.query);
    return ApiResponse.ok(res, 'Email queue retrieved successfully', data);
  }),
};

module.exports = notificationController;
