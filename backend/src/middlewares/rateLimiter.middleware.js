'use strict';

const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../config/env');
const ApiError = require('../utils/ApiError');

const createRateLimiter = (options = {}) => {
  const message = options.message || 'Too many requests, please try again later';
  return rateLimit({
    windowMs: options.windowMs || RATE_LIMIT.WINDOW_MS,
    max: options.max || RATE_LIMIT.MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
      next(ApiError.tooManyRequests(message));
    },
    ...options,
  });
};

/**
 * General API rate limiter
 */
const globalLimiter = createRateLimiter();

/**
 * Strict limiter for auth endpoints (login, register, forgot-password)
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: RATE_LIMIT.AUTH_MAX,
  message: 'Too many authentication attempts, please try again after 15 minutes',
});

/**
 * Strict limiter for password reset
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
});

/**
 * Payment endpoint limiter
 */
const paymentLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
});

module.exports = {
  globalLimiter,
  authLimiter,
  passwordResetLimiter,
  paymentLimiter,
};
