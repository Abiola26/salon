'use strict';

const { prisma } = require('../config/db');
const logger = require('../config/logger');

/**
 * Write an audit log entry to the database.
 *
 * @param {object} opts
 * @param {string|null}  opts.userId    - ID of the acting user (null for system actions)
 * @param {string}       opts.action    - AuditAction enum value
 * @param {string}       opts.details   - Human-readable description
 * @param {string|null}  opts.ipAddress - Optional IP address from the request
 */
const auditLog = async ({ userId = null, action, details, ipAddress = null }) => {
  try {
    await prisma.auditLog.create({
      data: { userId, action, details, ipAddress },
    });
  } catch (error) {
    // Never let audit failures crash the business logic
    logger.error(`AuditLog write failed [${action}]: ${error.message}`);
  }
};

module.exports = { auditLog };
