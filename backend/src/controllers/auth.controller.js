'use strict';

const authService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { setRefreshCookie, clearRefreshCookie, getRefreshCookie } = require('../utils/cookies');

const userAgentOf = (req) => req.get('User-Agent') || null;

const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, req.ip, userAgentOf(req));
    setRefreshCookie(res, result.refreshToken);
    return ApiResponse.created(res, 'Registration successful', result);
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, req.ip, userAgentOf(req));
    setRefreshCookie(res, result.refreshToken);
    return ApiResponse.ok(res, 'Login successful', result);
  }),

  refreshToken: asyncHandler(async (req, res) => {
    // httpOnly cookie first; body token keeps API/Swagger clients working.
    const token = getRefreshCookie(req) || req.body?.refreshToken;
    const tokens = await authService.refreshToken(token, req.ip, userAgentOf(req));
    setRefreshCookie(res, tokens.refreshToken);
    return ApiResponse.ok(res, 'Token refreshed successfully', tokens);
  }),

  logout: asyncHandler(async (req, res) => {
    const token = getRefreshCookie(req) || req.body?.refreshToken || null;
    await authService.logout(req.user.id, token, req.ip);
    clearRefreshCookie(res);
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
