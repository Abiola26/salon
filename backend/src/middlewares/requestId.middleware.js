'use strict';

const { randomUUID } = require('crypto');

/**
 * Attach a correlation id to every request/response so logs and client error
 * reports can be matched. Honors a sane inbound X-Request-Id (proxies, tests),
 * otherwise generates a UUID.
 */
const requestId = (req, res, next) => {
  const inbound = req.headers['x-request-id'];
  req.id =
    typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 100
      ? inbound
      : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

module.exports = requestId;
