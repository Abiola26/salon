'use strict';

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/user.repository');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateRandomToken, hashToken } = require('../utils/token');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/email');
const ApiError = require('../utils/ApiError');
const { BCRYPT_SALT_ROUNDS } = require('../config/env');

const authService = {
  async register(dto) {
    const existing = await userRepository.findByEmail(dto.email);
    if (existing) throw ApiError.conflict('Email is already registered');

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await userRepository.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone || null,
      role: dto.role || 'CUSTOMER',
    });

    // Fire-and-forget welcome email
    sendWelcomeEmail(user).catch(() => {});

    const accessToken = generateAccessToken({ id: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role });

    await userRepository.update(user.id, { refreshToken });

    return { user, accessToken, refreshToken };
  },

  async login(dto) {
    const user = await userRepository.findByEmail(dto.email);
    if (!user) throw ApiError.unauthorized('Invalid email or password');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

    const accessToken = generateAccessToken({ id: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role });

    await userRepository.update(user.id, { refreshToken });

    const { password: _, resetPasswordToken: __, resetPasswordExpiry: ___, refreshToken: ____, ...safeUser } = user;

    return { user: safeUser, accessToken, refreshToken };
  },

  async refreshToken(token) {
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

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },

  async logout(userId) {
    await userRepository.update(userId, { refreshToken: null });
  },

  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    // Always return success to prevent email enumeration
    if (!user) return;

    const rawToken = generateRandomToken();
    const hashedToken = hashToken(rawToken);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await userRepository.update(user.id, {
      resetPasswordToken: hashedToken,
      resetPasswordExpiry: expiry,
    });

    await sendPasswordResetEmail(user, rawToken);
  },

  async resetPassword(token, newPassword) {
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
  },
};

module.exports = authService;
