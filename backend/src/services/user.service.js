'use strict';

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');
const { BCRYPT_SALT_ROUNDS } = require('../config/env');

const userService = {
  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  },

  async updateProfile(userId, dto) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    return userRepository.update(userId, dto);
  },

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findByIdFull(userId);
    if (!user) throw ApiError.notFound('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw ApiError.badRequest('Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await userRepository.update(userId, { password: hashed, refreshToken: null });
  },

  async deleteAccount(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    await userRepository.delete(userId);
  },

  // Admin operations
  async getAllUsers({ page = 1, limit = 20, role } = {}) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      userRepository.findAll({ skip, take: limit, role }),
      userRepository.count(role ? { role } : {}),
    ]);
    return {
      users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async getUserById(id) {
    const user = await userRepository.findById(id);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  },

  async deleteUser(id) {
    const user = await userRepository.findById(id);
    if (!user) throw ApiError.notFound('User not found');
    await userRepository.delete(id);
  },

  async updateUser(id, dto) {
    const user = await userRepository.findById(id);
    if (!user) throw ApiError.notFound('User not found');
    
    // Clean up fields to only allow admin-safe updates
    const data = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.loyaltyPoints !== undefined) data.loyaltyPoints = parseInt(dto.loyaltyPoints) || 0;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    
    return userRepository.update(id, data);
  },
};

module.exports = userService;
