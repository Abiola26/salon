'use strict';

const { NODE_ENV, JWT } = require('../config/env');
const { parseDurationMs } = require('./token');

// Cookie name handed to the browser. Never readable from JS (httpOnly).
const REFRESH_COOKIE_NAME = 'salon_refresh';

// Keep the cookie lifetime in lockstep with JWT_REFRESH_EXPIRES_IN ('7d').
const REFRESH_COOKIE_MAX_AGE_MS = parseDurationMs(
  JWT.REFRESH_EXPIRES_IN,
  7 * 24 * 60 * 60 * 1000
);

// Path=/api so the cookie only travels with API calls (incl. the /api/v1 alias)
// and never leaks onto page navigations. SameSite=Lax: sent on same-site
// requests (the Next.js /api proxy is same-origin in dev and on Vercel) but
// never on cross-site POSTs → refresh CSRF is blocked.
const baseOptions = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api',
};

const setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions, maxAge: REFRESH_COOKIE_MAX_AGE_MS });

const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE_NAME, baseOptions);

const getRefreshCookie = (req) => (req.cookies ? req.cookies[REFRESH_COOKIE_NAME] || null : null);

module.exports = {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookie,
};
