'use strict';

/**
 * SMS Reminder Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 30 minutes and sends an SMS reminder to customers whose appointment
 * is scheduled 2 hours from now (±5 minute tolerance). Respects the customer's
 * `smsReminders` opt-in and dedupes via `Appointment.smsReminderSentAt`.
 *
 * Schedule: every 30 minutes (top of the hour and half-hour)
 */

const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendSms } = require('../utils/sms');
const { SALON_TIMEZONE } = require('../config/env');
const logger = require('../config/logger');

const REMINDER_HOURS_BEFORE = 2; // Remind 2 hours before appointment
const TOLERANCE_MINUTES = 5;     // ±5 minute tolerance window

const getSalonTimeParts = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SALON_TIMEZONE,
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

async function runSmsReminderJob({ now = new Date(), db = prisma } = {}) {
  logger.info('⏰ [SMS Reminder Job] Running...');

  const targetTime = new Date(now.getTime() + REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

  // Find appointments scheduled ±tolerance minutes around targetTime
  const windowStart = new Date(targetTime.getTime() - TOLERANCE_MINUTES * 60 * 1000);
  const windowEnd = new Date(targetTime.getTime() + TOLERANCE_MINUTES * 60 * 1000);

  // Normalize to just the local date for the DB date field in NY timezone
  const { dateStr: targetDate } = getSalonTimeParts(targetTime);

  // Build the list of HH:mm times in the window in NY timezone
  const windowTimes = [];
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const { timeStr } = getSalonTimeParts(cursor);
    windowTimes.push(timeStr);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  try {
    const appointments = await db.appointment.findMany({
      where: {
        appointmentDate: new Date(targetDate),
        appointmentTime: { in: windowTimes },
        status: { in: ['PENDING', 'CONFIRMED'] },
        // Phase 10: dedupe + opt-out. Users without a phone number are skipped
        // by the relation filter and never marked as reminded.
        smsReminderSentAt: null,
        user: { smsReminders: true, phoneNumber: { not: null } },
      },
      include: {
        user: { select: { id: true, name: true, phoneNumber: true, smsReminders: true } },
        service: { select: { name: true } },
        staff: { select: { name: true } },
      },
    });

    if (appointments.length === 0) {
      logger.info('⏰ [SMS Reminder Job] No upcoming appointments in window.');
      return { checked: 0, sent: 0, failed: 0, skipped: 0 };
    }

    logger.info(`⏰ [SMS Reminder Job] Sending ${appointments.length} reminder(s)...`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const appt of appointments) {
      if (!appt.user?.phoneNumber || appt.user.smsReminders === false) {
        skipped += 1;
        continue;
      }

      const stylistLine = appt.staff ? ` with ${appt.staff.name}` : '';
      const message =
        `Hi ${appt.user.name}! 💇 This is a reminder that your ` +
        `${appt.service.name} appointment${stylistLine} is in approximately ` +
        `2 hours (at ${appt.appointmentTime}). ` +
        'We look forward to seeing you! – The Salon Team';

      try {
        const result = await sendSms(appt.user.phoneNumber, message);
        if (!result || result.success === false) {
          failed += 1;
          logger.error(
            `⏰ [SMS Reminder Job] Failed for appointment ${appt.id}: ${result?.error || 'unknown error'}`
          );
          continue;
        }

        await db.appointment.update({
          where: { id: appt.id },
          data: { smsReminderSentAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        // One bad recipient must not block the rest of the batch.
        failed += 1;
        logger.error(
          `⏰ [SMS Reminder Job] Failed for appointment ${appt.id}: ${err.message}`
        );
      }
    }

    logger.info(
      `⏰ [SMS Reminder Job] Done. Sent ${sent}, failed ${failed}, skipped ${skipped}.`
    );
    return { checked: appointments.length, sent, failed, skipped };
  } catch (err) {
    logger.error(`⏰ [SMS Reminder Job] Error: ${err.message}`);
    return { checked: 0, sent: 0, failed: 0, skipped: 0, error: err.message };
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
    timezone: SALON_TIMEZONE, // salon-local window math below assumes this tz
  });

  logger.info(`⏰ [SMS Reminder Job] Scheduled — runs every 30 minutes (${SALON_TIMEZONE})`);
}

module.exports = { initSmsReminderJob, runSmsReminderJob };
