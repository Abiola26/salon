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

    it('rotates refresh token and returns new tokens on success', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      userRepository.findByIdFull.mockResolvedValue({ id: '1', email: 'test@example.com', refreshToken: 'refresh-token' });
      tokenUtils.generateAccessToken.mockReturnValue('new-access-token');
      tokenUtils.generateRefreshToken.mockReturnValue('new-refresh-token');
      userRepository.update.mockResolvedValue({});

      const result = await authService.refreshToken('refresh-token', '127.0.0.1');

      expect(result).toEqual({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
      expect(userRepository.update).toHaveBeenCalledWith('1', { refreshToken: 'new-refresh-token' });
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOKEN_REFRESHED' }));
    });
  });

  describe('logout', () => {
    it('nullifies user refresh token on logout', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: '1', email: 'test@example.com' });
      userRepository.update.mockResolvedValue({});

      await authService.logout('1', '127.0.0.1');

      expect(userRepository.update).toHaveBeenCalledWith('1', { refreshToken: null });
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOGOUT' }));
    });
  });

  describe('forgotPassword', () => {
    it('returns without error and logs audit when email is not registered', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await authService.forgotPassword('missing@example.com', '127.0.0.1');

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_REQUESTED', details: expect.stringContaining('non-existing') })
      );
    });

    it('generates reset token, updates user, and sends email on success', async () => {
      const user = { id: '1', email: 'test@example.com' };
      userRepository.findByEmail.mockResolvedValue(user);
      tokenUtils.generateRandomToken.mockReturnValue('random-token');
      tokenUtils.hashToken.mockReturnValue('hashed-token');
      userRepository.update.mockResolvedValue({});
      emailUtils.sendPasswordResetEmail.mockResolvedValue({});

      await authService.forgotPassword('test@example.com', '127.0.0.1');

      expect(userRepository.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ resetPasswordToken: 'hashed-token' })
      );
      expect(emailUtils.sendPasswordResetEmail).toHaveBeenCalledWith(user, 'random-token');
      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_REQUESTED', userId: '1' })
      );
    });
  });

  describe('resetPassword', () => {
    it('throws when reset token is invalid or expired', async () => {
      tokenUtils.hashToken.mockReturnValue('hashed-token');
      userRepository.findByResetToken.mockResolvedValue(null);

      await expect(authService.resetPassword('token', 'NewPass123!', '127.0.0.1')).rejects.toThrow(
        'Password reset token is invalid or has expired'
      );
    });

    it('updates password and nullifies reset fields and refresh token on success', async () => {
      tokenUtils.hashToken.mockReturnValue('hashed-token');
      userRepository.findByResetToken.mockResolvedValue({ id: '1', email: 'test@example.com' });
      bcrypt.hash.mockResolvedValue('hashedPassword');
      userRepository.update.mockResolvedValue({});

      await authService.resetPassword('token', 'NewPass123!', '127.0.0.1');

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 12);
      expect(userRepository.update).toHaveBeenCalledWith('1', {
        password: 'hashedPassword',
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        refreshToken: null,
      });
      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED', userId: '1' })
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('clears refreshToken and audits with user email when user is found', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: 'u1', email: 'alice@example.com' });
      userRepository.update.mockResolvedValue({});

      await authService.logout('u1', '::1');

      expect(userRepository.update).toHaveBeenCalledWith('u1', { refreshToken: null });
      // exercises the `user?.email` truthy branch
      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGOUT',
          details: expect.stringContaining('alice@example.com'),
        })
      );
    });

    it('falls back to userId in audit details when user record is null (exercises || branch)', async () => {
      // user was deleted between JWT issuance and logout call
      userRepository.findByIdFull.mockResolvedValue(null);
      userRepository.update.mockResolvedValue({});

      await authService.logout('ghost-id', '::1');

      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGOUT',
          details: expect.stringContaining('ghost-id'),
        })
      );
    });
  });

  // ─── Default ipAddress = null branches ────────────────────────────────────
  // Each of logout/forgotPassword/resetPassword has `ipAddress = null`.
  // Istanbul tracks whether the default (null) is used. We always pass '::1'
  // in our other tests, so we add one call per function omitting ipAddress.

  describe('default ipAddress = null branch coverage', () => {
    it('logout without ipAddress uses null default', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: 'u2', email: 'b@b.com' });
      userRepository.update.mockResolvedValue({});
      await authService.logout('u2'); // no ipAddress
      expect(userRepository.update).toHaveBeenCalledWith('u2', { refreshToken: null });
    });

    it('forgotPassword without ipAddress uses null default', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      await authService.forgotPassword('anon@x.com'); // no ipAddress
      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null })
      );
    });

    it('resetPassword without ipAddress uses null default', async () => {
      tokenUtils.hashToken.mockReturnValue('ht');
      userRepository.findByResetToken.mockResolvedValue(null);
      await expect(authService.resetPassword('tok', 'NewPw1')).rejects.toThrow(
        'Password reset token is invalid or has expired'
      );
    });
  });

  // ─── forgotPassword (non-existent email) ──────────────────────────────────

  describe('forgotPassword — non-existent user branch', () => {
    it('audits and returns silently when email is not registered', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      // Should NOT throw — anti-enumeration behaviour
      await expect(authService.forgotPassword('nobody@example.com', '::1')).resolves.toBeUndefined();

      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PASSWORD_RESET_REQUESTED',
          userId: null,
        })
      );
    });
  });
});
