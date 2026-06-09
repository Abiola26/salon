'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Middleware factory that validates req.body, req.params, or req.query
 * against a Zod schema.
 *
 * Usage:
 *   router.post('/register', validate(registerSchema), authController.register)
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(ApiError.unprocessable('Validation failed', errors));
    }

    // Replace source with parsed (coerced) data
    req[source] = result.data;
    next();
  };
};

module.exports = { validate };
