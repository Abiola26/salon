'use strict';

const staffLeaveService = require('../services/staffLeave.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const staffLeaveController = {
  getAllUpcomingLeave: asyncHandler(async (req, res) => {
    const leave = await staffLeaveService.getAllUpcomingLeave();
    return ApiResponse.ok(res, 'Leave periods retrieved successfully', leave);
  }),

  getLeaveForStaff: asyncHandler(async (req, res) => {
    const leave = await staffLeaveService.getLeaveForStaff(req.params.id);
    return ApiResponse.ok(res, 'Leave periods retrieved successfully', leave);
  }),

  createLeave: asyncHandler(async (req, res) => {
    const leave = await staffLeaveService.createLeave(req.params.id, req.body, req.user?.id, req.ip);
    return ApiResponse.created(res, 'Leave period created successfully', leave);
  }),

  deleteLeave: asyncHandler(async (req, res) => {
    await staffLeaveService.deleteLeave(req.params.leaveId, req.user?.id, req.ip);
    return ApiResponse.ok(res, 'Leave period deleted successfully');
  }),
};

module.exports = staffLeaveController;
