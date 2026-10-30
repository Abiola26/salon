'use strict';

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { NODE_ENV } = require('../config/env');

// Fields that must never reach the log stream
const SENSITIVE_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'apiKey',
  'cardNumber',
  'cvc',
]);

/**
 * Deep-clones a value with sensitive keys masked. Safe against cycles.
 */
const redact = (value, depth = 0) => {
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
};

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, _next) => {
  let error = err;

  // If not an ApiError, convert it
  if (!(error instanceof ApiError)) {
    // Handle Prisma-specific errors
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      error = ApiError.conflict(`A record with this ${field} already exists`);
    } else if (error.code === 'P2025') {
      error = ApiError.notFound('Record not found');
    } else if (error.code === 'P2003') {
      error = ApiError.badRequest('Foreign key constraint failed');
    } else if (error.name === 'ZodError') {
      const errors = error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      error = ApiError.unprocessable('Validation failed', errors);
    } else if (error.name === 'JsonWebTokenError') {
      error = ApiError.unauthorized('Invalid token');
    } else if (error.name === 'TokenExpiredError') {
      error = ApiError.unauthorized('Token has expired');
    } else if (error.type === 'StripeCardError') {
      error = ApiError.badRequest(error.message);
    } else if (error.type === 'StripeInvalidRequestError') {
      error = ApiError.badRequest('Invalid Stripe request');
    } else {
      error = new ApiError(
        error.statusCode || 500,
        error.message || 'Internal server error'
      );
    }
  }

  const statusCode = error.statusCode || 500;

  // Log server errors (request body redacted — may contain passwords/tokens)
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} — ${statusCode}: ${err.message}`, {
      requestId: req.id,
      stack: err.stack,
      body: redact(req.body),
      params: redact(req.params),
      query: redact(req.query),
    });
  } else {
    logger.warn(`[${req.method}] ${req.path} — ${statusCode}: ${error.message} (requestId=${req.id})`);
  }

  const response = {
    success: false,
    statusCode,
    message: error.message,
    requestId: req.id,
  };

  if (error.errors && error.errors.length > 0) {
    response.errors = error.errors;
  }

  if (NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = { errorHandler, notFoundHandler };
