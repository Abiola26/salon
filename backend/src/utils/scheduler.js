'use strict';

const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendAppointmentReminderEmail } = require('./email');
const { processEmailQueue } = require('./emailQueue');
const { SALON_TIMEZONE } = require('../config/env');
const logger = require('../config/logger');
/**
 * Send reminder emails for appointments scheduled for tomorrow.
 * Runs daily at 9:00 AM in the salon's timezone.
 */
const scheduleAppointmentReminders = () => {
  cron.schedule('0 9 * * *', async () => {
    logger.info('⏰ Running appointment reminder cron job...');

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const appointments = await prisma.appointment.findMany({
        where: {
          appointmentDate: { gte: tomorrow, lt: dayAfter },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        include: {
          user: true,
          service: true,
        },
      });

      logger.info(`Found ${appointments.length} appointment(s) to remind`);

      for (const appointment of appointments) {
        try {
          await sendAppointmentReminderEmail(
            appointment.user,
            appointment,
            appointment.service
          );
        } catch (err) {
          logger.error(
            `Failed to send reminder for appointment ${appointment.id}: ${err.message}`
          );
        }
      }
    } catch (error) {
      logger.error(`Reminder cron job failed: ${error.message}`);
    }
  }, { timezone: SALON_TIMEZONE });

  logger.info(`📅 Appointment reminder scheduler initialized (daily at 9:00 AM, ${SALON_TIMEZONE})`);
};

/**
 * Mark past confirmed appointments as COMPLETED.
 * Runs every hour.
 */
const scheduleCompletionMarker = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const result = await prisma.appointment.updateMany({
        where: {
          appointmentDate: { lt: today },
          status: 'CONFIRMED',
        },
        data: { status: 'COMPLETED' },
      });

      if (result.count > 0) {
        logger.info(`Marked ${result.count} appointment(s) as COMPLETED`);
      }
    } catch (error) {
      logger.error(`Completion marker cron failed: ${error.message}`);
    }
  }, { timezone: SALON_TIMEZONE });

  logger.info(`✅ Appointment completion marker initialized (hourly, ${SALON_TIMEZONE})`);
};

/**
 * Process pending emails from the database email queue.
 * Runs every 2 minutes; the queue itself is also nudged after each enqueue
 * (see utils/emailQueue.js), so this cron is only the retry backstop.
 */
const scheduleEmailQueueProcessor = () => {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const sent = await processEmailQueue();
      if (sent > 0) {
        logger.info(`📬 Email queue cron delivered ${sent} email(s)`);
      }
    } catch (error) {
      logger.error(`Email queue processor cron failed: ${error.message}`);
    }
  }, { timezone: SALON_TIMEZONE });

  logger.info(`📬 Email queue processor initialized (every 2 minutes, ${SALON_TIMEZONE})`);
};

const initSchedulers = () => {
  scheduleAppointmentReminders();
  scheduleCompletionMarker();
  scheduleEmailQueueProcessor();

  // SMS reminders — 2 hours before each appointment
  const { initSmsReminderJob } = require('../jobs/smsReminder.job');
  initSmsReminderJob();
};

module.exports = { initSchedulers };
