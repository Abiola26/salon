'use strict';

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
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash a plain token for safe DB storage
 */
const hashToken = (token) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
};
