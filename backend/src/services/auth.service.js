'use strict';

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/user.repository');
const refreshTokenRepository = require('../repositories/refreshToken.repository');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
  parseDurationMs,
} = require('../utils/token');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/email');
const ApiError = require('../utils/ApiError');
const { auditLog } = require('../utils/audit');
const { BCRYPT_SALT_ROUNDS, JWT } = require('../config/env');
const logger = require('../config/logger');

// Session lifetime mirrors JWT_REFRESH_EXPIRES_IN ('7d' by default).
const REFRESH_TTL_MS = parseDurationMs(JWT.REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

/**
 * Issue an access+refresh token pair and persist the session (hash only).
 * The raw refresh token goes to the client (httpOnly cookie / API body) and
 * is never stored server-side.
 */
const issueSession = async (user, { ipAddress = null, userAgent = null } = {}) => {
  const accessToken = generateAccessToken({ id: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id, role: user.role });

  await refreshTokenRepository.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    userAgent,
    ip: ipAddress,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return { accessToken, refreshToken };
};

const authService = {
  async register(dto, ipAddress = null, userAgent = null) {
    const existing = await userRepository.findByEmail(dto.email);
    if (existing) throw ApiError.conflict('Email is already registered');

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await userRepository.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone || null,
      role: 'CUSTOMER', // Always CUSTOMER — admins are promoted via PUT /api/users/:id
    });

    // Fire-and-forget welcome email
    sendWelcomeEmail(user).catch(() => {});

    await auditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      details: `User registered: ${user.email}`,
      ipAddress,
    });

    const tokens = await issueSession(user, { ipAddress, userAgent });

    return { user, ...tokens };
  },

  async login(dto, ipAddress = null, userAgent = null) {
    const user = await userRepository.findByEmail(dto.email);
    if (!user) throw ApiError.unauthorized('Invalid email or password');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

    const tokens = await issueSession(user, { ipAddress, userAgent });

    await auditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      details: `User logged in: ${user.email}`,
      ipAddress,
    });

    // eslint-disable-next-line no-unused-vars
    const { password, resetPasswordToken, resetPasswordExpiry, refreshToken: _, ...safeUser } = user;

    return { user: safeUser, ...tokens };
  },

  async refreshToken(token, ipAddress = null, userAgent = null) {
    if (!token) throw ApiError.unauthorized('Invalid or expired refresh token');

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(token);
    const session = await refreshTokenRepository.findByHash(tokenHash);

    if (!session || session.userId !== decoded.id || session.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token is invalid or has been revoked');
    }

    if (session.revokedAt) {
      // Replay of a rotated/revoked token ⇒ assume the token leaked and end
      // every active session for this user (reuse detection).
      await refreshTokenRepository.revokeAllForUser(session.userId);
      logger.warn(
        `Refresh-token reuse detected for user ${session.userId} — all sessions revoked`
      );
      throw ApiError.unauthorized('Refresh token is invalid or has been revoked');
    }

    const user = await userRepository.findByIdFull(session.userId);
    if (!user) throw ApiError.unauthorized('Refresh token is invalid or has been revoked');

    // Rotate: CAS-revoke the presented token first — a concurrent refresh that
    // loses this race gets a clean 401 instead of issuing a duplicate session.
    const rotated = await refreshTokenRepository.revokeById(session.id);
    if (rotated.count === 0) {
      throw ApiError.unauthorized('Refresh token is invalid or has been revoked');
    }

    const accessToken = generateAccessToken({ id: user.id, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id, role: user.role });

    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      userAgent,
      ip: ipAddress,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    await auditLog({
      userId: user.id,
      action: 'TOKEN_REFRESHED',
      details: `Refresh token rotated for user: ${user.email}`,
      ipAddress,
    });

    return { accessToken, refreshToken: newRefreshToken };
  },

  /**
   * Revoke refresh sessions. With a token (cookie/body) only that session is
   * ended; without one — or when the token no longer matches an active row —
   * every session for the user is revoked so logout always takes effect.
   */
  async logout(userId, token = null, ipAddress = null) {
    const user = await userRepository.findByIdFull(userId);

    if (token) {
      const revoked = await refreshTokenRepository.revokeByHash(hashToken(token));
      if (revoked.count === 0) {
        await refreshTokenRepository.revokeAllForUser(userId);
      }
    } else {
      await refreshTokenRepository.revokeAllForUser(userId);
    }

    await auditLog({
      userId,
      action: 'USER_LOGOUT',
      details: `User logged out: ${user?.email || userId}`,
      ipAddress,
    });
  },

  async forgotPassword(email, ipAddress = null) {
    const user = await userRepository.findByEmail(email);
    // Always return success to prevent email enumeration
    if (!user) {
      await auditLog({
        userId: null,
        action: 'PASSWORD_RESET_REQUESTED',
        details: `Password reset requested for non-existing email: ${email}`,
        ipAddress,
      });
      return;
    }

    const rawToken = generateRandomToken();
    const hashedToken = hashToken(rawToken);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await userRepository.update(user.id, {
      resetPasswordToken: hashedToken,
      resetPasswordExpiry: expiry,
    });

    await sendPasswordResetEmail(user, rawToken);

    await auditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      details: `Password reset requested for ${user.email}`,
      ipAddress,
    });
  },

  async resetPassword(token, newPassword, ipAddress = null) {
    const hashedToken = hashToken(token);
    const user = await userRepository.findByResetToken(hashedToken);

    if (!user) throw ApiError.badRequest('Password reset token is invalid or has expired');

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await userRepository.update(user.id, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpiry: null,
    });
    // Password reset ends every existing session.
    await refreshTokenRepository.revokeAllForUser(user.id);

    await auditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      details: `Password reset completed for ${user.email}`,
      ipAddress,
    });
  },
};

module.exports = authService;
