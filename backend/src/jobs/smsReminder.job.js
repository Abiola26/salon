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

const getNewYorkTimeParts = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  let hour = partMap.hour;
  if (hour === '24') hour = '00';

  return {
    dateStr: `${partMap.year}-${partMap.month}-${partMap.day}`,
    timeStr: `${hour}:${partMap.minute}`,
  };
};

async function runSmsReminderJob() {
  logger.info('⏰ [SMS Reminder Job] Running...');

  const now = new Date();
  const targetTime = new Date(now.getTime() + REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

  // Find appointments scheduled ±tolerance minutes around targetTime
  const windowStart = new Date(targetTime.getTime() - TOLERANCE_MINUTES * 60 * 1000);
  const windowEnd = new Date(targetTime.getTime() + TOLERANCE_MINUTES * 60 * 1000);

  // Normalize to just the local date for the DB date field in NY timezone
  const { dateStr: targetDate } = getNewYorkTimeParts(targetTime);

  // Build the list of HH:mm times in the window in NY timezone
  const windowTimes = [];
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const { timeStr } = getNewYorkTimeParts(cursor);
    windowTimes.push(timeStr);
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
  // Run every 30 minutes: '*/30 * * * *'
  cron.schedule('*/30 * * * *', runSmsReminderJob, {
    scheduled: true,
    timezone: 'America/New_York', // Adjust to your salon's timezone
  });

  logger.info('⏰ [SMS Reminder Job] Scheduled — runs every 30 minutes');
}

module.exports = { initSmsReminderJob, runSmsReminderJob };
