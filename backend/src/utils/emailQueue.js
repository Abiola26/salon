'use strict';

const { prisma } = require('../config/db');
const logger = require('../config/logger');

/**
 * Enqueue an email for reliable background delivery.
 * Writes a row to the `email_queue` table with status PENDING.
 *
 * @param {object} opts
 * @param {string} opts.to      - Recipient email address
 * @param {string} opts.subject - Email subject line
 * @param {string} opts.html    - HTML body
 */
const enqueueEmail = async ({ to, subject, html }) => {
  try {
    await prisma.emailQueue.create({
      data: { to, subject, html, status: 'PENDING', attempts: 0 },
    });
    logger.debug(`📬 Email enqueued → ${to} | ${subject}`);
  } catch (error) {
    logger.error(`Failed to enqueue email to ${to}: ${error.message}`);
  }
};

module.exports = { enqueueEmail };
