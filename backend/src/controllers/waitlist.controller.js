'use strict';

const waitlistService = require('../services/waitlist.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const waitlistController = {
  joinWaitlist: asyncHandler(async (req, res) => {
    const entry = await waitlistService.joinWaitlist(req.user.id, req.body);
    return ApiResponse.created(res, 'Added to the waitlist successfully', entry);
  }),

  getMyWaitlist: asyncHandler(async (req, res) => {
    const entries = await waitlistService.getMyWaitlist(req.user.id);
    return ApiResponse.ok(res, 'Waitlist retrieved successfully', entries);
  }),

  getAdminWaitlist: asyncHandler(async (req, res) => {
    const result = await waitlistService.getAdminWaitlist(req.query);
    return ApiResponse.ok(res, 'Waitlist retrieved successfully', result.entries, {
      ...result.meta,
      summary: result.summary,
    });
  }),

  notifyEntry: asyncHandler(async (req, res) => {
    const entry = await waitlistService.notifyEntry(req.params.id, req.user?.id, req.ip);
    return ApiResponse.ok(res, 'Waitlist customer notified successfully', entry);
  }),

  cancelEntry: asyncHandler(async (req, res) => {
    const entry = await waitlistService.cancelEntry(req.params.id, req.user.id, req.user.role);
    return ApiResponse.ok(res, 'Waitlist entry cancelled successfully', entry);
  }),
};

module.exports = waitlistController;
