'use strict';

const userService = require('../services/user.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const userController = {
  getProfile: asyncHandler(async (req, res) => {
    const user = await userService.getProfile(req.user.id);
    return ApiResponse.ok(res, 'Profile retrieved successfully', user);
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(req.user.id, req.body);
    return ApiResponse.ok(res, 'Profile updated successfully', user);
  }),

  changePassword: asyncHandler(async (req, res) => {
    await userService.changePassword(req.user.id, req.body);
    return ApiResponse.ok(res, 'Password changed successfully');
  }),

  deleteAccount: asyncHandler(async (req, res) => {
    await userService.deleteAccount(req.user.id);
    return ApiResponse.ok(res, 'Account deleted successfully');
  }),

  // Admin controllers
  getAllUsers: asyncHandler(async (req, res) => {
    const { page, limit, role } = req.query;
    const result = await userService.getAllUsers({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      role,
    });
    return ApiResponse.ok(res, 'Users retrieved successfully', result.users, result.meta);
  }),

  getUserById: asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    return ApiResponse.ok(res, 'User retrieved successfully', user);
  }),

  deleteUser: asyncHandler(async (req, res) => {
    await userService.deleteUser(req.params.id);
    return ApiResponse.ok(res, 'User deleted successfully');
  }),
};

module.exports = userController;
