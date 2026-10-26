'use strict';

const { prisma } = require('../config/db');
const transporter = require('../config/email');
const { EMAIL } = require('../config/env');
const logger = require('../config/logger');

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

// In-process mutex: the nudge (right after an enqueue) and the 2-minute cron
// can fire at the same time — serialize them so one row is never sent twice.
// Sufficient while the backend runs as a single process (Render single
// instance); if we ever scale horizontally, move claiming to a status column
// (`SENDING`) instead of this lock.
let activeRun = null;
let rerunRequested = false;

/**
 * Deliver pending queue rows: PENDING → SENT, or back to PENDING (retry via
 * the cron) until attempts hit MAX_ATTEMPTS, then FAILED. Each claim is a CAS
 * update on (status, attempts) so a concurrent runner skips rows this one
 * already owns.
 *
 * @returns {Promise<number>} number of emails sent in this invocation
 */
const runProcessor = async (limit) => {
  const pending = await prisma.emailQueue.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  for (const email of pending) {
    const claim = await prisma.emailQueue.updateMany({
      where: { id: email.id, status: 'PENDING', attempts: email.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue; // claimed by another runner

    const attemptsUsed = email.attempts + 1;
    try {
      await transporter.sendMail({
        from: EMAIL.FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
        ...(email.ics && {
          attachments: [
            {
              filename: 'appointment.ics',
              content: email.ics,
              contentType: 'text/calendar; charset=utf-8',
            },
          ],
        }),
      });
      await prisma.emailQueue.update({
        where: { id: email.id },
        data: { status: 'SENT' },
      });
      sent += 1;
      logger.info(`✅ Email sent from queue → ${email.to}`);
    } catch (err) {
      await prisma.emailQueue.update({
        where: { id: email.id },
        data: {
          status: attemptsUsed >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          lastError: err.message,
        },
      });
      logger.warn(
        `⚠️  Email failed (attempt ${attemptsUsed}/${MAX_ATTEMPTS}) → ${email.to}: ${err.message}`
      );
    }
  }
  return sent;
};

/**
 * Process the queue, joining (and re-running for) a run already in flight so
 * an enqueue-triggered nudge never misses its own row.
 */
const processEmailQueue = async (limit = BATCH_SIZE) => {
  if (activeRun) {
    rerunRequested = true;
    return activeRun;
  }
  activeRun = (async () => {
    let total = 0;
    do {
      rerunRequested = false;
      total += await runProcessor(limit);
    } while (rerunRequested);
    return total;
  })().finally(() => {
    activeRun = null;
  });
  return activeRun;
};

/**
 * Enqueue an email for reliable background delivery.
 * Writes a row to the `email_queue` table with status PENDING, then nudges
 * the processor so latency matches a direct send — anything that fails the
 * first attempt is retried by the every-2-minute cron (MAX_ATTEMPTS total).
 * Never throws: mail problems must not fail the business operation that
 * triggered them (bookings, refunds, password resets).
 *
 * @param {object} opts
 * @param {string} opts.to      - Recipient email address
 * @param {string} opts.subject - Email subject line
 * @param {string} opts.html    - HTML body
 * @param {string} [opts.ics]   - Optional RFC 5545 calendar payload (attached as text/calendar)
 * @returns {Promise<object|null>} created row, or null on enqueue failure
 */
const enqueueEmail = async ({ to, subject, html, ics }) => {
  try {
    const row = await prisma.emailQueue.create({
      data: {
        to,
        subject,
        html,
        status: 'PENDING',
        attempts: 0,
        ...(ics && { ics }),
      },
    });
    logger.debug(`📬 Email enqueued → ${to} | ${subject}`);
    processEmailQueue().catch((err) =>
      logger.error(`Email queue nudge failed: ${err.message}`)
    );
    return row;
  } catch (error) {
    logger.error(`Failed to enqueue email to ${to}: ${error.message}`);
    return null;
  }
};

module.exports = { enqueueEmail, processEmailQueue };
