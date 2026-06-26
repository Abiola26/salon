'use strict';

const bcrypt = require('bcryptjs');
const userService = require('../../src/services/user.service');
const userRepository = require('../../src/repositories/user.repository');
const ApiError = require('../../src/utils/ApiError');

jest.mock('../../src/repositories/user.repository');
jest.mock('bcryptjs');

describe('userService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getProfile', () => {
    it('throws when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.getProfile('1')).rejects.toThrow('User not found');
    });

    it('returns user profile when found', async () => {
      const user = { id: '1', name: 'John Doe', email: 'john@example.com' };
      userRepository.findById.mockResolvedValue(user);

      const result = await userService.getProfile('1');
      expect(result).toEqual(user);
    });
  });

  describe('updateProfile', () => {
    it('throws when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.updateProfile('1', { name: 'New Name' })).rejects.toThrow('User not found');
    });

    it('updates user profile', async () => {
      const user = { id: '1', name: 'John Doe' };
      userRepository.findById.mockResolvedValue(user);
      userRepository.update.mockResolvedValue({ ...user, name: 'New Name' });

      const result = await userService.updateProfile('1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });
  });

  describe('changePassword', () => {
    it('throws when user not found', async () => {
      userRepository.findByIdFull.mockResolvedValue(null);

      await expect(
        userService.changePassword('1', { currentPassword: 'old', newPassword: 'new' })
      ).rejects.toThrow('User not found');
    });

    it('throws when current password is incorrect', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: '1', password: 'hashedOld' });
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        userService.changePassword('1', { currentPassword: 'wrongOld', newPassword: 'new' })
      ).rejects.toThrow('Current password is incorrect');
    });

    it('hashes new password and resets refresh token on success', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: '1', password: 'hashedOld' });
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('hashedNew');
      userRepository.update.mockResolvedValue();

      await userService.changePassword('1', { currentPassword: 'old', newPassword: 'new' });

      expect(bcrypt.hash).toHaveBeenCalledWith('new', 12);
      expect(userRepository.update).toHaveBeenCalledWith('1', {
        password: 'hashedNew',
        refreshToken: null,
      });
    });
  });

  describe('deleteAccount', () => {
    it('throws when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.deleteAccount('1')).rejects.toThrow('User not found');
    });

    it('deletes user when found', async () => {
      userRepository.findById.mockResolvedValue({ id: '1' });
      userRepository.delete.mockResolvedValue();

      await userService.deleteAccount('1');

      expect(userRepository.delete).toHaveBeenCalledWith('1');
    });
  });

  describe('getAllUsers', () => {
    it('returns paginated list of users without role filter', async () => {
      const users = [{ id: '1', name: 'User 1' }];
      userRepository.findAll.mockResolvedValue(users);
      userRepository.count.mockResolvedValue(1);

      const result = await userService.getAllUsers({ page: 1, limit: 10 });

      expect(result).toEqual({
        users,
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });
      // No role — count should be called with empty filter {}
      expect(userRepository.count).toHaveBeenCalledWith({});
    });

    it('filters count by role when role is provided (exercises ternary branch)', async () => {
      userRepository.findAll.mockResolvedValue([]);
      userRepository.count.mockResolvedValue(0);

      await userService.getAllUsers({ page: 1, limit: 10, role: 'ADMIN' });

      expect(userRepository.count).toHaveBeenCalledWith({ role: 'ADMIN' });
    });

    it('uses default page/limit when called with no args', async () => {
      userRepository.findAll.mockResolvedValue([]);
      userRepository.count.mockResolvedValue(0);
      const result = await userService.getAllUsers();
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('getUserById', () => {
    it('throws when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserById('1')).rejects.toThrow('User not found');
    });

    it('returns user when found', async () => {
      const user = { id: '1', name: 'User' };
      userRepository.findById.mockResolvedValue(user);

      const result = await userService.getUserById('1');
      expect(result).toEqual(user);
    });
  });

  describe('deleteUser', () => {
    it('throws when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.deleteUser('1')).rejects.toThrow('User not found');
    });

    it('deletes user when found', async () => {
      userRepository.findById.mockResolvedValue({ id: '1' });
      userRepository.delete.mockResolvedValue();

      await userService.deleteUser('1');
      expect(userRepository.delete).toHaveBeenCalledWith('1');
    });
  });

  describe('updateUser', () => {
    it('throws when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(userService.updateUser('1', { name: 'Name' })).rejects.toThrow('User not found');
    });

    it('filters input and updates user with all fields', async () => {
      userRepository.findById.mockResolvedValue({ id: '1' });
      userRepository.update.mockResolvedValue({ id: '1', role: 'ADMIN', loyaltyPoints: 100 });

      await userService.updateUser('1', {
        role: 'ADMIN',
        loyaltyPoints: '100',
        name: 'New Name',
        email: 'new@example.com',
        phone: '12345',
        unallowedField: 'hack',
      });

      expect(userRepository.update).toHaveBeenCalledWith('1', {
        role: 'ADMIN',
        loyaltyPoints: 100,
        name: 'New Name',
        email: 'new@example.com',
        phone: '12345',
      });
    });

    it('skips undefined fields — exercises each false branch of if checks', async () => {
      userRepository.findById.mockResolvedValue({ id: '1' });
      userRepository.update.mockResolvedValue({ id: '1', name: 'Partial' });

      // Only name is set; role, loyaltyPoints, email, phone are all undefined
      await userService.updateUser('1', { name: 'Partial' });

      expect(userRepository.update).toHaveBeenCalledWith('1', { name: 'Partial' });
    });

    it('handles loyaltyPoints that parses to 0 (NaN fallback branch)', async () => {
      userRepository.findById.mockResolvedValue({ id: '1' });
      userRepository.update.mockResolvedValue({ id: '1', loyaltyPoints: 0 });

      await userService.updateUser('1', { loyaltyPoints: 'not-a-number' });

      expect(userRepository.update).toHaveBeenCalledWith('1', { loyaltyPoints: 0 });
    });
  });
});
