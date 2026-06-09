'use strict';

const winston = require('winston');
const path = require('path');
const { NODE_ENV } = require('./env');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

const transports = [
  new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
  }),
];

if (NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      format: combine(timestamp(), json()),
    })
  );
}

const logger = winston.createLogger({
  level: NODE_ENV === 'development' ? 'debug' : 'info',
  defaultMeta: { service: 'salon-api' },
  transports,
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: path.join('logs', 'exceptions.log') })]
      : []),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: path.join('logs', 'rejections.log') })]
      : []),
  ],
});

module.exports = logger;
