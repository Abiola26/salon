'use strict';

/**
 * SMS Utility — Twilio integration with graceful console-log fallback.
 *
 * In production, set:
 *   TWILIO_ACCOUNT_SID   = your Twilio account SID
 *   TWILIO_AUTH_TOKEN    = your Twilio auth token
 *   TWILIO_FROM_NUMBER   = your Twilio sender number (e.g. +15005550006)
 *
 * In development (without those vars), SMS messages are printed to the
 * console instead so the app still works without a real Twilio account.
 */

const logger = require('../config/logger');

let twilioClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (accountSid && authToken) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(accountSid, authToken);
      logger.info('📱 Twilio SMS client initialized');
    } catch {
      logger.warn('Twilio package not loaded; falling back to console SMS');
    }
  }

  return twilioClient;
}

/**
 * Send an SMS message.
 * @param {string} to   - Recipient phone number (E.164 format, e.g. +15551234567)
 * @param {string} body - The SMS message text
 */
async function sendSms(to, body) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;

  if (client && from && to) {
    try {
      const message = await client.messages.create({ to, from, body });
      logger.info(`📱 SMS sent to ${to} — SID: ${message.sid}`);
      return { success: true, sid: message.sid };
    } catch (err) {
      logger.error(`📱 SMS failed to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  } else {
    // Development fallback — log to console
    logger.info(`📱 [SMS MOCK] To: ${to || 'N/A'} | Message: ${body}`);
    console.log(`\n📱 ── SMS REMINDER (DEV MODE) ──────────────────────────`);
    console.log(`   To:      ${to || 'No phone number on file'}`);
    console.log(`   Message: ${body}`);
    console.log(`───────────────────────────────────────────────────────\n`);
    return { success: true, mock: true };
  }
}

module.exports = { sendSms };
