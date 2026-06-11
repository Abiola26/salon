'use strict';

const authService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, req.ip);
    return ApiResponse.created(res, 'Registration successful', result);
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, req.ip);
    return ApiResponse.ok(res, 'Login successful', result);
  }),

  refreshToken: asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshToken(refreshToken, req.ip);
    return ApiResponse.ok(res, 'Token refreshed successfully', tokens);
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.user.id, req.ip);
    return ApiResponse.ok(res, 'Logged out successfully');
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email, req.ip);
    // Always respond the same to prevent email enumeration
    return ApiResponse.ok(
      res,
      'If an account with that email exists, a password reset link has been sent.'
    );
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    await authService.resetPassword(token, password, req.ip);
    return ApiResponse.ok(res, 'Password has been reset successfully. Please log in.');
  }),
};

module.exports = authController;
