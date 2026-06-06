'use strict';

const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendAppointmentReminderEmail } = require('./email');
const transporter = require('../config/email');
const { EMAIL } = require('../config/env');
const logger = require('../config/logger');

/**
 * Send reminder emails for appointments scheduled for tomorrow.
 * Runs daily at 9:00 AM.
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
  });

  logger.info('📅 Appointment reminder scheduler initialized (daily at 9:00 AM)');
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
  });

  logger.info('✅ Appointment completion marker initialized (hourly)');
};

/**
 * Process pending emails from the database email queue.
 * Runs every 2 minutes, handles up to 10 emails per tick.
 */
const scheduleEmailQueueProcessor = () => {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const pending = await prisma.emailQueue.findMany({
        where: { status: 'PENDING', attempts: { lt: 3 } },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });

      if (pending.length === 0) return;

      logger.info(`📧 Email queue processor: ${pending.length} email(s) to send`);

      for (const email of pending) {
        try {
          await transporter.sendMail({
            from: EMAIL.FROM,
            to: email.to,
            subject: email.subject,
            html: email.html,
          });

          await prisma.emailQueue.update({
            where: { id: email.id },
            data: { status: 'SENT', updatedAt: new Date() },
          });

          logger.info(`✅ Email sent from queue → ${email.to}`);
        } catch (err) {
          const newAttempts = email.attempts + 1;
          await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
              attempts: newAttempts,
              lastError: err.message,
              status: newAttempts >= 3 ? 'FAILED' : 'PENDING',
              updatedAt: new Date(),
            },
          });
          logger.warn(`⚠️  Email failed (attempt ${newAttempts}) → ${email.to}: ${err.message}`);
        }
      }
    } catch (error) {
      logger.error(`Email queue processor cron failed: ${error.message}`);
    }
  });

  logger.info('📬 Email queue processor initialized (every 2 minutes)');
};

const initSchedulers = () => {
  scheduleAppointmentReminders();
  scheduleCompletionMarker();
  scheduleEmailQueueProcessor();
};

module.exports = { initSchedulers };
