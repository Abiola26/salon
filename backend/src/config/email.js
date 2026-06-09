'use strict';

const nodemailer = require('nodemailer');
const { EMAIL } = require('./env');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
  host: EMAIL.HOST,
  port: EMAIL.PORT,
  secure: EMAIL.SECURE,
  auth: {
    user: EMAIL.USER,
    pass: EMAIL.PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    logger.warn(`Email transporter not ready: ${error.message}`);
  } else {
    logger.info('📧 Email transporter ready');
  }
});

module.exports = transporter;
