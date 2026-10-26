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

// Path=/ so the cookie is available to both API calls (/api/*) and
// Next.js server-side route guards (src/proxy.ts gating /admin, /dashboard, etc.).
// SameSite=Lax: sent on same-site navigations and requests but never on cross-site POSTs
// → refresh CSRF is blocked.
const baseOptions = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

const setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions, maxAge: REFRESH_COOKIE_MAX_AGE_MS });

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions);
  // Also clear legacy path='/api' if present from previous sessions
  res.clearCookie(REFRESH_COOKIE_NAME, { ...baseOptions, path: '/api' });
};

const getRefreshCookie = (req) => (req.cookies ? req.cookies[REFRESH_COOKIE_NAME] || null : null);

module.exports = {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookie,
};
