'use strict';

const transporter = require('../config/email');
const { EMAIL, CLIENT_URL } = require('../config/env');
const logger = require('../config/logger');

/**
 * Send a generic email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: EMAIL.FROM,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent to ${to} — MessageId: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    throw error;
  }
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
  await sendEmail({
    to: user.email,
    subject: '⏰ Appointment Reminder — Tomorrow!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#6d28d9">Reminder: Appointment Tomorrow ⏰</h2>
        <p>Hi ${user.name}, just a reminder about your appointment tomorrow!</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Service</td><td style="padding:8px;border:1px solid #e5e7eb">${service.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #e5e7eb">${new Date(appointment.appointmentDate).toDateString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Time</td><td style="padding:8px;border:1px solid #e5e7eb">${appointment.appointmentTime}</td></tr>
        </table>
        <p>We look forward to seeing you!</p>
      </div>
    `,
    text: `Reminder: Your ${service.name} appointment is tomorrow at ${appointment.appointmentTime}`,
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

const sendCancellationEmail = async (user, appointment, service) => {
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
        <p>We hope to see you again soon. <a href="${CLIENT_URL}">Book a new appointment</a></p>
      </div>
    `,
    text: `Your appointment for ${service.name} on ${appointment.appointmentDate} has been cancelled.`,
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
};

