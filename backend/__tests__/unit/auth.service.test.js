'use strict';

const bcrypt = require('bcryptjs');
const authService = require('../../src/services/auth.service');
const userRepository = require('../../src/repositories/user.repository');
const refreshTokenRepository = require('../../src/repositories/refreshToken.repository');
const emailUtils = require('../../src/utils/email');
const tokenUtils = require('../../src/utils/token');
const auditUtils = require('../../src/utils/audit');
const logger = require('../../src/config/logger');
const ApiError = require('../../src/utils/ApiError');

jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/repositories/refreshToken.repository');
jest.mock('../../src/utils/email');
// Keep parseDurationMs real (module-level REFRESH_TTL_MS depends on it),
// mock everything else the service imports.
jest.mock('../../src/utils/token', () => ({
  ...jest.requireActual('../../src/utils/token'),
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  generateRandomToken: jest.fn(),
  hashToken: jest.fn(),
}));
jest.mock('../../src/utils/audit');
jest.mock('../../src/config/logger');
jest.mock('bcryptjs');

describe('authService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auditUtils.auditLog.mockResolvedValue();
    tokenUtils.hashToken.mockReturnValue('hashed-session-hash');
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
      refreshTokenRepository.create.mockResolvedValue({});
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
      // Session lives in the refresh_tokens table (hash only) — never on users
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '1',
          tokenHash: 'hashed-session-hash',
          expiresAt: expect.any(Date),
        })
      );
      expect(userRepository.update).not.toHaveBeenCalled();
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
      refreshTokenRepository.create.mockResolvedValue({});

      const result = await authService.login({ email: 'test@example.com', password: 'correct' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).toEqual(expect.objectContaining({ id: '1', email: 'test@example.com', role: 'CUSTOMER' }));
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '1', tokenHash: 'hashed-session-hash' })
      );
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOGIN' }));
    });
  });

  describe('refreshToken', () => {
    const validSession = {
      id: 'session-1',
      userId: '1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('throws when refresh token is invalid', async () => {
      tokenUtils.verifyRefreshToken.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(authService.refreshToken('bad-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
      expect(refreshTokenRepository.findByHash).not.toHaveBeenCalled();
    });

    it('throws when no session row matches the token', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue(null);

      await expect(authService.refreshToken('refresh-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
      expect(refreshTokenRepository.create).not.toHaveBeenCalled();
    });

    it('throws when the session belongs to a different user than the JWT', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue({ ...validSession, userId: 'someone-else' });

      await expect(authService.refreshToken('refresh-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
    });

    it('throws when the session is expired', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue({
        ...validSession,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(authService.refreshToken('refresh-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
    });

    it('detects replay of a rotated token: revokes ALL sessions and rejects', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue({
        ...validSession,
        revokedAt: new Date(), // already rotated/revoked ⇒ someone replayed it
      });
      refreshTokenRepository.revokeAllForUser.mockResolvedValue({ count: 3 });

      await expect(authService.refreshToken('stolen-old-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('1');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('reuse detected for user 1')
      );
      expect(refreshTokenRepository.create).not.toHaveBeenCalled();
    });

    it('throws when the user no longer exists', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue(validSession);
      userRepository.findByIdFull.mockResolvedValue(null);

      await expect(authService.refreshToken('refresh-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
    });

    it('throws when a concurrent refresh already rotated the session (lost CAS race)', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue(validSession);
      userRepository.findByIdFull.mockResolvedValue({ id: '1', email: 'test@example.com', role: 'CUSTOMER' });
      refreshTokenRepository.revokeById.mockResolvedValue({ count: 0 });

      await expect(authService.refreshToken('refresh-token')).rejects.toThrow(
        'Refresh token is invalid or has been revoked'
      );
      expect(refreshTokenRepository.create).not.toHaveBeenCalled();
    });

    it('rotates the session and returns new tokens on success', async () => {
      tokenUtils.verifyRefreshToken.mockReturnValue({ id: '1', role: 'CUSTOMER' });
      refreshTokenRepository.findByHash.mockResolvedValue(validSession);
      userRepository.findByIdFull.mockResolvedValue({ id: '1', email: 'test@example.com', role: 'CUSTOMER' });
      refreshTokenRepository.revokeById.mockResolvedValue({ count: 1 });
      tokenUtils.generateAccessToken.mockReturnValue('new-access-token');
      tokenUtils.generateRefreshToken.mockReturnValue('new-refresh-token');
      refreshTokenRepository.create.mockResolvedValue({});

      const result = await authService.refreshToken('refresh-token', '127.0.0.1', 'jest-agent');

      expect(result).toEqual({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
      expect(refreshTokenRepository.revokeById).toHaveBeenCalledWith('session-1');
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '1',
          tokenHash: 'hashed-session-hash',
          ip: '127.0.0.1',
          userAgent: 'jest-agent',
        })
      );
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOKEN_REFRESHED' }));
    });

    it('rejects an empty token without touching the database', async () => {
      await expect(authService.refreshToken(null)).rejects.toThrow('Invalid or expired refresh token');
      expect(refreshTokenRepository.findByHash).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes only the presented session when its token is provided', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: '1', email: 'test@example.com' });
      refreshTokenRepository.revokeByHash.mockResolvedValue({ count: 1 });

      await authService.logout('1', 'current-token', '127.0.0.1');

      expect(refreshTokenRepository.revokeByHash).toHaveBeenCalledWith('hashed-session-hash');
      expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(auditUtils.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOGOUT' }));
    });

    it('falls back to revoking ALL sessions when the token matches no active row', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: '1', email: 'test@example.com' });
      refreshTokenRepository.revokeByHash.mockResolvedValue({ count: 0 });
      refreshTokenRepository.revokeAllForUser.mockResolvedValue({ count: 2 });

      await authService.logout('1', 'stale-token', '127.0.0.1');

      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('1');
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

    it('updates password, nullifies reset fields, and revokes all sessions on success', async () => {
      tokenUtils.hashToken.mockReturnValue('hashed-token');
      userRepository.findByResetToken.mockResolvedValue({ id: '1', email: 'test@example.com' });
      bcrypt.hash.mockResolvedValue('hashedPassword');
      userRepository.update.mockResolvedValue({});
      refreshTokenRepository.revokeAllForUser.mockResolvedValue({ count: 1 });

      await authService.resetPassword('token', 'NewPass123!', '127.0.0.1');

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 12);
      expect(userRepository.update).toHaveBeenCalledWith('1', {
        password: 'hashedPassword',
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      });
      // Password reset must end every existing session
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('1');
      expect(auditUtils.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED', userId: '1' })
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('audits with user email when user is found', async () => {
      userRepository.findByIdFull.mockResolvedValue({ id: 'u1', email: 'alice@example.com' });
      refreshTokenRepository.revokeByHash.mockResolvedValue({ count: 1 });

      await authService.logout('u1', 'session-token', '::1');

      expect(refreshTokenRepository.revokeByHash).toHaveBeenCalledWith('hashed-session-hash');
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
      refreshTokenRepository.revokeAllForUser.mockResolvedValue({ count: 1 });

      await authService.logout('ghost-id', null, '::1');

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
      refreshTokenRepository.revokeAllForUser.mockResolvedValue({ count: 1 });
      await authService.logout('u2'); // no token, no ipAddress
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('u2');
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
