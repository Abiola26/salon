'use strict';

const bcrypt = require('bcryptjs');
const authService = require('../../src/services/auth.service');
const userRepository = require('../../src/repositories/user.repository');
const emailUtils = require('../../src/utils/email');
const tokenUtils = require('../../src/utils/token');
const auditUtils = require('../../src/utils/audit');
const ApiError = require('../../src/utils/ApiError');

jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/utils/email');
jest.mock('../../src/utils/token');
jest.mock('../../src/utils/audit');
jest.mock('bcryptjs');

describe('authService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auditUtils.auditLog.mockResolvedValue();
  });

  describe('register', () => {
    it('throws when email is already registered', async () => {
      userRepository.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        authService.register({ name: 'A', email: 'test@example.com', password: 'secret' })
      ).rejects.toThrow('Email is already registered');

      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('creates a new user and returns tokens', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedPassword');
      userRepository.create.mockResolvedValue({ id: '1', name: 'Test', email: 'test@example.com', role: 'CUSTOMER' });
      tokenUtils.generateAccessToken.mockReturnValue('access-token');
      tokenUtils.generateRefreshToken.mockReturnValue('refresh-token');
      userRepository.update.mockResolvedValue({ id: '1', refreshToken: 'refresh-token' });
      emailUtils.sendWelcomeEmail.mockResolvedValue();

      const result = await authService.register({
        name: 'Test',
        email: 'test@example.com',
        password: 'secret',
      });

      expect(result).toEqual({
        user: { id: '1', name: 'Test', email: 'test@example.com', role: 'CUSTOMER' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
      expect(emailUtils.sendWelcomeEmail).toHaveBeenCalled();
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_REGISTERED' }));
    });
  });

  describe('login', () => {
    it('throws when email does not exist', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.login({ email: 'missing@example.com', password: 'pass' })).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('throws when password does not match', async () => {
      userRepository.findByEmail.mockResolvedValue({ id: '1', email: 'test@example.com', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(false);

      await expect(authService.login({ email: 'test@example.com', password: 'wrong' })).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('returns safe user data and tokens on successful login', async () => {
      const storedUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashed',
        role: 'CUSTOMER',
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      };

      userRepository.findByEmail.mockResolvedValue(storedUser);
      bcrypt.compare.mockResolvedValue(true);
      tokenUtils.generateAccessToken.mockReturnValue('access-token');
      tokenUtils.generateRefreshToken.mockReturnValue('refresh-token');
      userRepository.update.mockResolvedValue({ id: '1', refreshToken: 'refresh-token' });

      const result = await authService.login({ email: 'test@example.com', password: 'correct' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).toEqual(expect.objectContaining({ id: '1', email: 'test@example.com', role: 'CUSTOMER' }));
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOGIN' }));
    });
  });

  describe('refreshToken', () => {
    it('throws when refresh token is invalid', async () => {
      tokenUtils.verifyRefreshToken.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(authService.refreshToken('bad-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('throws when refresh token does not match stored token', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      userRepository.findByIdFull.mockResolvedValue({ id: '1', refreshToken: 'other-token' });

      await expect(authService.refreshToken('refresh-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
    });
  });
});
