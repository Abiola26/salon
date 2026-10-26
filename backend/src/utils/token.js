'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT } = require('../config/env');

/**
 * Generate a short-lived access token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT.ACCESS_SECRET, {
    expiresIn: JWT.ACCESS_EXPIRES_IN,
  });
};

/**
 * Generate a long-lived refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT.REFRESH_SECRET, {
    expiresIn: JWT.REFRESH_EXPIRES_IN,
  });
};

/**
 * Verify an access token — throws if invalid/expired
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT.ACCESS_SECRET);
};

/**
 * Verify a refresh token — throws if invalid/expired
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT.REFRESH_SECRET);
};

/**
 * Generate a cryptographic random token (for password reset, etc.)
 */
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash a plain token for safe DB storage
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Parse a JWT-style duration ('7d', '15m', '30s', '2h', plain number of
 * seconds) into milliseconds. Returns fallbackMs for anything unparseable.
 */
const parseDurationMs = (value, fallbackMs = 0) => {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(value ?? '').trim());
  if (!match) return fallbackMs;
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return Number(match[1]) * unitMs[(match[2] || 's').toLowerCase()];
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
  parseDurationMs,
};
