'use strict';

const { enqueueEmail } = require('./emailQueue');
const { buildAppointmentIcs } = require('./ics');
const { toDateOnly } = require('./salonTime');
const { CLIENT_URL } = require('../config/env');
const logger = require('../config/logger');

/**
 * Queue a generic email for delivery via the email_queue pipeline
 * (immediate nudge attempt + cron retries). Never throws — the queue logs
 * enqueue failures and business operations proceed without mail.
 * `ics` (optional RFC 5545 payload) is attached as text/calendar.
 */
const sendEmail = async ({ to, subject, html, text, ics }) => {
  const row = await enqueueEmail({
    to,
    subject,
    html: html || text,
    ...(ics && { ics }),
  });
  if (row) {
    logger.info(`Email queued → ${to} | ${subject}`);
  }
  return row;
};

// ─── Templates ────────────────────────────────────────────────────────────────

const sendWelcomeEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: '✂️ Welcome to Salon Bookings!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Welcome, ${user.name}! ✂️</h2>
        <p>Thank you for registering with Salon Bookings. We're excited to have you!</p>
        <p>You can now browse our services and book your next appointment.</p>
        <a href="${CLIENT_URL}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;border-radius:6px;text-decoration:none;margin-top:16px">
          Book an Appointment
        </a>
        <p style="color:#6b7280;margin-top:32px;font-size:12px">
          If you didn't create this account, please ignore this email.
        </p>
      </div>
    `,
    text: `Welcome, ${user.name}! Thank you for registering with Salon Bookings.`,
  });
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetURL = `${CLIENT_URL}/reset-password?token=${resetToken}`;
  await sendEmail({
    to: user.email,
    subject: '🔐 Password Reset Request',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Password Reset</h2>
        <p>Hi ${user.name}, you requested a password reset.</p>
        <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetURL}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;border-radius:6px;text-decoration:none;margin-top:16px">
          Reset Password
        </a>
        <p style="color:#6b7280;margin-top:16px;font-size:13px">
          Or copy this link: <a href="${resetURL}">${resetURL}</a>
        </p>
        <p style="color:#6b7280;margin-top:32px;font-size:12px">
          If you didn't request this, please ignore this email.
        </p>
      </div>
    `,
    text: `Reset your password: ${resetURL}`,
  });
};

const sendAppointmentConfirmationEmail = async (user, appointment, service) => {
  await sendEmail({
    to: user.email,
    subject: '📅 Appointment Confirmed!',
    ics: buildAppointmentIcs(appointment, service),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Appointment Confirmed ✅</h2>
        <p>Hi ${user.name}, your appointment has been confirmed!</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #e5e7eb">${new Date(appointment.appointmentDate).toDateString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Time</td><td style="padding:8px;border:1px solid #e5e7eb">${appointment.appointmentTime}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Duration</td><td style="padding:8px;border:1px solid #e5e7eb">${service.duration} minutes</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Price</td><td style="padding:8px;border:1px solid #e5e7eb">$${service.price}</td></tr>
        </table>
        <p style="color:#6b7280;margin-top:32px;font-size:12px">
          Need to cancel or reschedule? Log in to your account.
        </p>
      </div>
    `,
    text: `Appointment confirmed for ${service.name} on ${appointment.appointmentDate} at ${appointment.appointmentTime}`,
  });
};

const sendAppointmentReminderEmail = async (user, appointment, service) => {
  const stylistLine = appointment.staff?.name
    ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Stylist</td><td style="padding:8px;border:1px solid #e5e7eb">${appointment.staff.name}</td></tr>`
    : '';

  return sendEmail({
    to: user.email,
    subject: '⏰ Appointment Reminder — Tomorrow!',
    ics: buildAppointmentIcs(appointment, service),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Reminder: Appointment Tomorrow ⏰</h2>
        <p>Hi ${user.name}, just a reminder about your appointment tomorrow!</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #e5e7eb">${new Date(appointment.appointmentDate).toDateString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Time</td><td style="padding:8px;border:1px solid #e5e7eb">${appointment.appointmentTime}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Duration</td><td style="padding:8px;border:1px solid #e5e7eb">${service.duration} minutes</td></tr>
          ${stylistLine}
        </table>
        <p>We look forward to seeing you!</p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">
          Need to cancel or reschedule? Manage your booking from
          <a href="${CLIENT_URL}/dashboard" style="color:#6d28d9">your dashboard</a>.
          Reminder preferences can be changed there too.
        </p>
      </div>
    `,
    text: `Reminder: Your ${service.name} appointment is tomorrow at ${appointment.appointmentTime}. Manage your booking at ${CLIENT_URL}/dashboard`,
  });
};

const sendPaymentConfirmationEmail = async (user, payment, appointment, service) => {
  const amount = typeof payment.amount === 'number'
    ? payment.amount.toFixed(2)
    : parseFloat(payment.amount).toFixed(2);

  await sendEmail({
    to: user.email,
    subject: '💳 Payment Confirmed!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Payment Confirmed 💳</h2>
        <p>Hi ${user.name}, your payment has been received successfully!</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Amount Paid</td><td style="padding:8px;border:1px solid #e5e7eb">$${amount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Payment Type</td><td style="padding:8px;border:1px solid #e5e7eb">${payment.paymentType}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #e5e7eb">${payment.stripePaymentIntentId}</td></tr>
        </table>
      </div>
    `,
    text: `Payment of $${amount} confirmed for ${service.name}`,
  });
};

const sendCancellationEmail = async (
  user,
  appointment,
  service,
  { depositForfeited = false, freeCancelHours = 48, refundedPayments = 0 } = {}
) => {
  const policyNote = depositForfeited
    ? `<p style="color:#b45309">Because this cancellation was made less than ${freeCancelHours} hours before the appointment, the deposit is forfeited per our cancellation policy.</p>`
    : refundedPayments > 0
      ? '<p style="color:#047857">Your payment has been refunded. Please allow 5-10 business days for it to appear.</p>'
      : '';
  const policyText = depositForfeited
    ? ` Because this cancellation was made less than ${freeCancelHours} hours before the appointment, the deposit is forfeited.`
    : refundedPayments > 0
      ? ' Your payment has been refunded.'
      : '';

  await sendEmail({
    to: user.email,
    subject: '❌ Appointment Cancelled',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Appointment Cancelled</h2>
        <p>Hi ${user.name}, your appointment has been cancelled.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #e5e7eb">${new Date(appointment.appointmentDate).toDateString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Time</td><td style="padding:8px;border:1px solid #e5e7eb">${appointment.appointmentTime}</td></tr>
        </table>
        ${policyNote}
        <p>We hope to see you again soon. <a href="${CLIENT_URL}">Book a new appointment</a></p>
      </div>
    `,
    text: `Your appointment for ${service.name} on ${appointment.appointmentDate} has been cancelled.${policyText}`,
  });
};

const waitlistBookLink = (entry) => {
  const date = toDateOnly(entry.preferredDate);
  const params = new URLSearchParams({ serviceId: entry.serviceId, date });
  if (entry.staffId) params.set('staffId', entry.staffId);
  return `${CLIENT_URL}/book?${params.toString()}`;
};

const waitlistDateLabel = (entry) =>
  new Date(`${toDateOnly(entry.preferredDate)}T12:00:00.000Z`).toLocaleDateString(
    'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
  );

const sendWaitlistJoinedEmail = async (user, entry, service) => {
  const dateLabel = waitlistDateLabel(entry);
  const timeLine = entry.preferredTime
    ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Preferred time</td><td style="padding:8px;border:1px solid #e5e7eb">${entry.preferredTime}</td></tr>`
    : '';
  const staffLine = entry.staff?.name
    ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Stylist</td><td style="padding:8px;border:1px solid #e5e7eb">${entry.staff.name}</td></tr>`
    : '';

  await sendEmail({
    to: user.email,
    subject: '⏳ You are on the waitlist',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">You are on the waitlist ⏳</h2>
        <p>Hi ${user.name}, we will email you if a matching slot opens up.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #e5e7eb">${dateLabel}</td></tr>
          ${timeLine}
          ${staffLine}
        </table>
        <p style="color:#6b7280;margin-top:16px;font-size:13px">
          You can cancel your waitlist request from
          <a href="${CLIENT_URL}/dashboard" style="color:#6d28d9">your dashboard</a>.
        </p>
      </div>
    `,
    text: `You are on the waitlist for ${service.name} on ${dateLabel}. Manage it at ${CLIENT_URL}/dashboard`,
  });
};

const sendWaitlistAvailabilityEmail = async (user, entry, service) => {
  const dateLabel = waitlistDateLabel(entry);
  const bookLink = waitlistBookLink(entry);
  const timeLine = entry.preferredTime
    ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Preferred time</td><td style="padding:8px;border:1px solid #e5e7eb">${entry.preferredTime}</td></tr>`
    : '';
  const staffLine = entry.staff?.name
    ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Stylist</td><td style="padding:8px;border:1px solid #e5e7eb">${entry.staff.name}</td></tr>`
    : '';

  await sendEmail({
    to: user.email,
    subject: '✨ A slot opened up!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">A slot opened up ✨</h2>
        <p>Hi ${user.name}, availability just opened for your waitlist request. Book soon before it is taken.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #e5e7eb">${dateLabel}</td></tr>
          ${timeLine}
          ${staffLine}
        </table>
        <a href="${bookLink}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;border-radius:6px;text-decoration:none;margin-top:16px">
          Book My Slot
        </a>
        <p style="color:#6b7280;margin-top:16px;font-size:13px">
          Or copy this link: <a href="${bookLink}">${bookLink}</a>
        </p>
      </div>
    `,
    text: `A slot opened for ${service.name} on ${dateLabel}. Book it at ${bookLink}`,
  });
};

const sendRefundEmail = async (user, payment, service) => {
  const amount = typeof payment.amount === 'number'
    ? payment.amount.toFixed(2)
    : parseFloat(payment.amount).toFixed(2);

  await sendEmail({
    to: user.email,
    subject: '💸 Refund Processed',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Refund Processed 💸</h2>
        <p>Hi ${user.name}, we have successfully processed a refund for your booking.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Refund Amount</td><td style="padding:8px;border:1px solid #e5e7eb">$${amount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Payment Type</td><td style="padding:8px;border:1px solid #e5e7eb">${payment.paymentType}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #e5e7eb">${payment.stripePaymentIntentId}</td></tr>
        </table>
        <p style="color:#6b7280;margin-top:16px;font-size:13px">
          Refunds typically appear in your account within 5–10 business days, depending on your bank.
        </p>
        <p>We hope to see you again soon. <a href="${CLIENT_URL}">Book a new appointment</a></p>
      </div>
    `,
    text: `Refund of $${amount} processed for ${service.name}. Reference: ${payment.stripePaymentIntentId}`,
  });
};
module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  sendPaymentConfirmationEmail,
  sendCancellationEmail,
  sendRefundEmail,
  sendWaitlistJoinedEmail,
  sendWaitlistAvailabilityEmail,
};
