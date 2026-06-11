'use strict';

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/user.repository');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateRandomToken, hashToken } = require('../utils/token');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/email');
const ApiError = require('../utils/ApiError');
const { auditLog } = require('../utils/audit');
const { BCRYPT_SALT_ROUNDS } = require('../config/env');

const authService = {
  async register(dto, ipAddress = null) {
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

    const accessToken = generateAccessToken({ id: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role });

    await userRepository.update(user.id, { refreshToken });

    return { user, accessToken, refreshToken };
  },

  async login(dto, ipAddress = null) {
    const user = await userRepository.findByEmail(dto.email);
    if (!user) throw ApiError.unauthorized('Invalid email or password');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

    const accessToken = generateAccessToken({ id: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role });

    await userRepository.update(user.id, { refreshToken });

    await auditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      details: `User logged in: ${user.email}`,
      ipAddress,
    });

    // eslint-disable-next-line no-unused-vars
    const { password, resetPasswordToken, resetPasswordExpiry, refreshToken: _, ...safeUser } = user;

    return { user: safeUser, accessToken, refreshToken };
  },

  async refreshToken(token, ipAddress = null) {
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await userRepository.findByIdFull(decoded.id);
    if (!user || user.refreshToken !== token) {
      throw ApiError.unauthorized('Refresh token is invalid or has been revoked');
    }

    const newAccessToken = generateAccessToken({ id: user.id, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id, role: user.role });

    await userRepository.update(user.id, { refreshToken: newRefreshToken });

    await auditLog({
      userId: user.id,
      action: 'TOKEN_REFRESHED',
      details: `Refresh token rotated for user: ${user.email}`,
      ipAddress,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },

  async logout(userId, ipAddress = null) {
    const user = await userRepository.findByIdFull(userId);
    await userRepository.update(userId, { refreshToken: null });

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
      refreshToken: null,
    });

    await auditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      details: `Password reset completed for ${user.email}`,
      ipAddress,
    });
  },
};

module.exports = authService;
