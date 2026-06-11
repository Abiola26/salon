'use strict';

/**
 * SMS Reminder Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every hour and sends an SMS reminder to customers whose appointment
 * is scheduled 2 hours from now (±5 minute tolerance).
 *
 * Schedule: 0 * * * *  (top of every hour)
 */

const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendSms } = require('../utils/sms');
const logger = require('../config/logger');

const REMINDER_HOURS_BEFORE = 2; // Remind 2 hours before appointment
const TOLERANCE_MINUTES = 5;     // ±5 minute tolerance window

async function runSmsReminderJob() {
  logger.info('⏰ [SMS Reminder Job] Running...');

  const now = new Date();
  const targetTime = new Date(now.getTime() + REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

  // Find appointments scheduled ±tolerance minutes around targetTime
  const windowStart = new Date(targetTime.getTime() - TOLERANCE_MINUTES * 60 * 1000);
  const windowEnd = new Date(targetTime.getTime() + TOLERANCE_MINUTES * 60 * 1000);

  // Normalize to just the date for the DB date field
  const targetDate = targetTime.toISOString().split('T')[0];

  // Build the list of HH:mm times in the window
  const windowTimes = [];
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const h = String(cursor.getHours()).padStart(2, '0');
    const m = String(cursor.getMinutes()).padStart(2, '0');
    windowTimes.push(`${h}:${m}`);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        appointmentDate: new Date(targetDate),
        appointmentTime: { in: windowTimes },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        service: { select: { name: true } },
        staff: { select: { name: true } },
      },
    });

    if (appointments.length === 0) {
      logger.info('⏰ [SMS Reminder Job] No upcoming appointments in window.');
      return;
    }

    logger.info(`⏰ [SMS Reminder Job] Sending ${appointments.length} reminder(s)...`);

    for (const appt of appointments) {
      const stylistLine = appt.staff ? ` with ${appt.staff.name}` : '';
      const message =
        `Hi ${appt.user.name}! 💇 This is a reminder that your ` +
        `${appt.service.name} appointment${stylistLine} is in approximately ` +
        `2 hours (at ${appt.appointmentTime}). ` +
        'We look forward to seeing you! – The Salon Team';

      await sendSms(appt.user.phone, message);
    }

    logger.info(`⏰ [SMS Reminder Job] Done. Sent ${appointments.length} reminder(s).`);
  } catch (err) {
    logger.error(`⏰ [SMS Reminder Job] Error: ${err.message}`);
  }
}

/**
 * Initialize the SMS reminder cron job.
 * Call this once from server.js at startup.
 */
function initSmsReminderJob() {
  // Run at the top of every hour: '0 * * * *'
  cron.schedule('0 * * * *', runSmsReminderJob, {
    scheduled: true,
    timezone: 'America/New_York', // Adjust to your salon's timezone
  });

  logger.info('⏰ [SMS Reminder Job] Scheduled — runs every hour');
}

module.exports = { initSmsReminderJob, runSmsReminderJob };
