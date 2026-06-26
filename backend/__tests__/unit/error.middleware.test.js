'use strict';

const { errorHandler, notFoundHandler } = require('../../src/middlewares/error.middleware');
const ApiError = require('../../src/utils/ApiError');
const logger = require('../../src/config/logger');

jest.mock('../../src/config/logger');

describe('errorMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.resetAllMocks();
    req = { method: 'GET', path: '/test', originalUrl: '/test', body: {}, params: {}, query: {} };
    res = {
      json: jest.fn(),
    };
    res.status = jest.fn(() => res);
    next = jest.fn();
  });

  describe('errorHandler', () => {
    it('handles ApiError instances directly', () => {
      const err = ApiError.notFound('Custom Not Found');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 404,
          message: 'Custom Not Found',
        })
      );
    });

    it('maps Prisma P2002 to conflict ApiError', () => {
      const err = new Error();
      err.code = 'P2002';
      err.meta = { target: ['email'] };

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'A record with this email already exists',
        })
      );
    });

    it('maps Prisma P2025 to notFound ApiError', () => {
      const err = new Error();
      err.code = 'P2025';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Record not found',
        })
      );
    });

    it('maps Prisma P2003 to badRequest ApiError', () => {
      const err = new Error();
      err.code = 'P2003';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Foreign key constraint failed',
        })
      );
    });

    it('maps ZodError to unprocessable ApiError', () => {
      const err = new Error();
      err.name = 'ZodError';
      err.errors = [
        { path: ['email'], message: 'Invalid email' },
        { path: ['password'], message: 'Too short' },
      ];

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Validation failed',
          errors: [
            { field: 'email', message: 'Invalid email' },
            { field: 'password', message: 'Too short' },
          ],
        })
      );
    });

    it('maps JsonWebTokenError to unauthorized ApiError', () => {
      const err = new Error();
      err.name = 'JsonWebTokenError';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token',
        })
      );
    });

    it('maps TokenExpiredError to unauthorized ApiError', () => {
      const err = new Error();
      err.name = 'TokenExpiredError';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has expired',
        })
      );
    });

    it('maps StripeCardError to badRequest ApiError', () => {
      const err = new Error('Card declined');
      err.type = 'StripeCardError';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Card declined',
        })
      );
    });

    it('maps StripeInvalidRequestError to badRequest ApiError', () => {
      const err = new Error();
      err.type = 'StripeInvalidRequestError';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid Stripe request',
        })
      );
    });

    it('falls back to internal server error 500 for generic unmapped errors', () => {
      const err = new Error('Database connection timeout');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Database connection timeout',
        })
      );
    });
  });

  describe('notFoundHandler', () => {
    it('creates and forwards a 404 ApiError', () => {
      notFoundHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const errorPassed = next.mock.calls[0][0];
      expect(errorPassed.statusCode).toBe(404);
      expect(errorPassed.message).toContain('Route not found');
    });
  });
});
