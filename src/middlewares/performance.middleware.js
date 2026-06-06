'use strict';

const logger = require('../config/logger');

const performanceLogger = (req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    // If request took longer than 200ms, log a warning
    if (parseFloat(durationInMs) > 200) {
      logger.warn(
        `⏱️  [SLOW REQUEST] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${durationInMs}ms`
      );
    } else {
      logger.debug(
        `[REQUEST] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${durationInMs}ms`
      );
    }
  });

  next();
};

module.exports = performanceLogger;
