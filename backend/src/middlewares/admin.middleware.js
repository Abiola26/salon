'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Restrict route access to specific roles.
 * Usage: authorizeRoles('ADMIN') or authorizeRoles('ADMIN', 'CUSTOMER')
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
};

/**
 * Shorthand — Admin only
 */
const adminOnly = authorizeRoles('ADMIN');

module.exports = { authorizeRoles, adminOnly };
