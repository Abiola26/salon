'use strict';

/**
 * Daily email reminder job (Phase 10).
 * Sends one reminder per appointment scheduled for tomorrow (salon-local),
 * respecting the customer's `emailReminders` opt-in and deduping through
 * `Appointment.emailReminderSentAt` so reruns are safe.
 */

const { prisma } = require('../config/db');
const { sendAppointmentReminderEmail } = require('../utils/email');
const { salonDateString, addDaysToDateString } = require('../utils/salonTime');
const logger = require('../config/logger');

const runAppointmentReminderJob = async ({ now = new Date(), db = prisma } = {}) => {
  const tomorrow = addDaysToDateString(salonDateString(now), 1);

  const appointments = await db.appointment.findMany({
    where: {
      appointmentDate: new Date(`${tomorrow}T00:00:00.000Z`),
      status: { in: ['PENDING', 'CONFIRMED'] },
      emailReminderSentAt: null,
      user: { emailReminders: true, deletedAt: null },
    },
    include: {
      user: true,
      service: true,
      staff: { select: { name: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const appointment of appointments) {
    if (!appointment.user?.email || appointment.user.emailReminders === false) {
      skipped += 1;
      continue;
    }

    try {
      const queued = await sendAppointmentReminderEmail(
        appointment.user,
        appointment,
        appointment.service
      );

      if (!queued) {
        failed += 1;
        logger.error(
          `Reminder enqueue failed for appointment ${appointment.id} (${appointment.user.email})`
        );
        continue;
      }

      await db.appointment.update({
        where: { id: appointment.id },
        data: { emailReminderSentAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      // One broken recipient must not block the rest of the batch.
      failed += 1;
      logger.error(
        `Failed to send reminder for appointment ${appointment.id}: ${err.message}`
      );
    }
  }

  logger.info(
    `Found ${appointments.length} appointment(s) to remind. Sent ${sent}, failed ${failed}, skipped ${skipped}.`
  );
  return { checked: appointments.length, sent, failed, skipped };
};

module.exports = { runAppointmentReminderJob };
