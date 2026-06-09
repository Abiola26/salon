'use strict';

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { NODE_ENV } = require('../config/env');

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
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

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} — ${statusCode}: ${err.message}`, {
      stack: err.stack,
      body: req.body,
      params: req.params,
      query: req.query,
    });
  } else {
    logger.warn(`[${req.method}] ${req.path} — ${statusCode}: ${error.message}`);
  }

  const response = {
    success: false,
    statusCode,
    message: error.message,
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
