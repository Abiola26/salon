'use strict';

/**
 * Unit tests for controllers.
 * Controllers are thin wrappers — we verify they call the correct service
 * method with the right arguments and send the appropriate HTTP response.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

// Minimal express-compatible req.get for controller helpers (User-Agent etc.)
const withGet = (req) => ({ ...req, get: (header) => (header === 'User-Agent' ? 'jest-agent' : null) });

const mockNext = () => jest.fn();

// Wrap an asyncHandler-based controller so we can await it in tests
const callController = async (handler, req, res, next) => {
  // asyncHandler wraps the function, so just call the returned function
  await handler(req, res, next);
};

// ─── Auth Controller ───────────────────────────────────────────────────────────

jest.mock('../../src/services/auth.service');
const authService = require('../../src/services/auth.service');
const authController = require('../../src/controllers/auth.controller');

describe('authController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('calls authService.register, sets the refresh cookie, returns 201', async () => {
      const user = { id: 'u1', email: 'a@b.com' };
      authService.register.mockResolvedValue({ ...user, accessToken: 'at', refreshToken: 'rt' });
      const req = withGet({ body: { email: 'a@b.com', password: 'pw' }, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.register, req, res, next);

      expect(authService.register).toHaveBeenCalledWith(req.body, req.ip, 'jest-agent');
      expect(res.cookie).toHaveBeenCalledWith('salon_refresh', 'rt', expect.objectContaining({ httpOnly: true }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Registration successful' })
      );
    });

    it('propagates service errors to next', async () => {
      const err = new Error('Email taken');
      authService.register.mockRejectedValue(err);
      const req = withGet({ body: {}, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.register, req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('login', () => {
    it('calls authService.login, sets the refresh cookie, returns 200', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r' };
      authService.login.mockResolvedValue(tokens);
      const req = withGet({ body: { email: 'a@b.com', password: 'pw' }, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.login, req, res, next);

      expect(authService.login).toHaveBeenCalledWith(req.body, req.ip, 'jest-agent');
      expect(res.cookie).toHaveBeenCalledWith('salon_refresh', 'r', expect.objectContaining({ httpOnly: true }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('propagates errors to next', async () => {
      authService.login.mockRejectedValue(new Error('Bad creds'));
      const req = withGet({ body: {}, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.login, req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('calls authService.refreshToken with token from body, sets rotated cookie', async () => {
      authService.refreshToken.mockResolvedValue({ accessToken: 'new', refreshToken: 'new-rt' });
      const req = withGet({ body: { refreshToken: 'rt' }, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.refreshToken, req, res, next);

      expect(authService.refreshToken).toHaveBeenCalledWith('rt', '::1', 'jest-agent');
      expect(res.cookie).toHaveBeenCalledWith('salon_refresh', 'new-rt', expect.objectContaining({ httpOnly: true }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('prefers the httpOnly cookie over the body token', async () => {
      authService.refreshToken.mockResolvedValue({ accessToken: 'new', refreshToken: 'new-rt' });
      const req = withGet({
        body: {},
        cookies: { salon_refresh: 'cookie-rt' },
        ip: '::1',
      });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.refreshToken, req, res, next);

      expect(authService.refreshToken).toHaveBeenCalledWith('cookie-rt', '::1', 'jest-agent');
    });

    it('propagates errors to next', async () => {
      authService.refreshToken.mockRejectedValue(new Error('Invalid'));
      const req = withGet({ body: { refreshToken: 'bad' }, ip: '::1' });
      const res = mockRes();
      const next = mockNext();
      await callController(authController.refreshToken, req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('calls authService.logout with cookie token and clears the cookie', async () => {
      authService.logout.mockResolvedValue(undefined);
      const req = withGet({ user: { id: 'u1' }, cookies: { salon_refresh: 'rt' }, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.logout, req, res, next);

      expect(authService.logout).toHaveBeenCalledWith('u1', 'rt', '::1');
      expect(res.clearCookie).toHaveBeenCalledWith('salon_refresh', expect.objectContaining({ httpOnly: true }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('passes a null token when no cookie or body token exists', async () => {
      authService.logout.mockResolvedValue(undefined);
      const req = withGet({ user: { id: 'u1' }, ip: '::1' });
      const res = mockRes();
      const next = mockNext();

      await callController(authController.logout, req, res, next);

      expect(authService.logout).toHaveBeenCalledWith('u1', null, '::1');
    });

    it('propagates errors to next', async () => {
      authService.logout.mockRejectedValue(new Error('fail'));
      const req = { user: { id: 'u1' }, ip: '::1' };
      const res = mockRes();
      const next = mockNext();
      await callController(authController.logout, req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('calls authService.forgotPassword and returns generic message', async () => {
      authService.forgotPassword.mockResolvedValue(undefined);
      const req = { body: { email: 'a@b.com' }, ip: '::1' };
      const res = mockRes();
      const next = mockNext();

      await callController(authController.forgotPassword, req, res, next);

      expect(authService.forgotPassword).toHaveBeenCalledWith('a@b.com', '::1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('password reset link') })
      );
    });

    it('propagates errors to next', async () => {
      authService.forgotPassword.mockRejectedValue(new Error('fail'));
      const req = { body: { email: 'x' }, ip: '::1' };
      const res = mockRes();
      const next = mockNext();
      await callController(authController.forgotPassword, req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('calls authService.resetPassword and returns 200', async () => {
      authService.resetPassword.mockResolvedValue(undefined);
      const req = { body: { token: 'tok', password: 'newpw' }, ip: '::1' };
      const res = mockRes();
      const next = mockNext();

      await callController(authController.resetPassword, req, res, next);

      expect(authService.resetPassword).toHaveBeenCalledWith('tok', 'newpw', '::1');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('propagates errors to next', async () => {
      authService.resetPassword.mockRejectedValue(new Error('fail'));
      const req = { body: { token: 'bad', password: 'pw' }, ip: '::1' };
      const res = mockRes();
      const next = mockNext();
      await callController(authController.resetPassword, req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});

// ─── User Controller ───────────────────────────────────────────────────────────

jest.mock('../../src/services/user.service');
const userService = require('../../src/services/user.service');
const userController = require('../../src/controllers/user.controller');

describe('userController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getProfile — returns user profile', async () => {
    const user = { id: 'u1', name: 'Alice' };
    userService.getProfile.mockResolvedValue(user);
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.getProfile, req, res, next);

    expect(userService.getProfile).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getProfile — propagates errors', async () => {
    userService.getProfile.mockRejectedValue(new Error('not found'));
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.getProfile, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('updateProfile — returns updated user', async () => {
    const updated = { id: 'u1', name: 'Bob' };
    userService.updateProfile.mockResolvedValue(updated);
    const req = { user: { id: 'u1' }, body: { name: 'Bob' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.updateProfile, req, res, next);

    expect(userService.updateProfile).toHaveBeenCalledWith('u1', { name: 'Bob' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateProfile — propagates errors', async () => {
    userService.updateProfile.mockRejectedValue(new Error('fail'));
    const req = { user: { id: 'u1' }, body: {} };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.updateProfile, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('changePassword — returns 200 on success', async () => {
    userService.changePassword.mockResolvedValue(undefined);
    const req = { user: { id: 'u1' }, body: { currentPassword: 'old', newPassword: 'new' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.changePassword, req, res, next);

    expect(userService.changePassword).toHaveBeenCalledWith('u1', req.body);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('changePassword — propagates errors', async () => {
    userService.changePassword.mockRejectedValue(new Error('bad pw'));
    const req = { user: { id: 'u1' }, body: {} };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.changePassword, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('deleteAccount — returns 200 on success', async () => {
    userService.deleteAccount.mockResolvedValue(undefined);
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.deleteAccount, req, res, next);

    expect(userService.deleteAccount).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteAccount — propagates errors', async () => {
    userService.deleteAccount.mockRejectedValue(new Error('fail'));
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.deleteAccount, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('getAllUsers — parses query params and returns paginated result', async () => {
    const result = { users: [], meta: { total: 0 } };
    userService.getAllUsers.mockResolvedValue(result);
    const req = { query: { page: '2', limit: '10', role: 'ADMIN' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.getAllUsers, req, res, next);

    expect(userService.getAllUsers).toHaveBeenCalledWith({ page: 2, limit: 10, role: 'ADMIN' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getAllUsers — uses defaults when query params are missing', async () => {
    userService.getAllUsers.mockResolvedValue({ users: [], meta: {} });
    const req = { query: {} };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.getAllUsers, req, res, next);

    expect(userService.getAllUsers).toHaveBeenCalledWith({ page: 1, limit: 20, role: undefined });
  });

  it('getAllUsers — propagates errors', async () => {
    userService.getAllUsers.mockRejectedValue(new Error('db fail'));
    const req = { query: {} };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.getAllUsers, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('getUserById — returns user', async () => {
    const user = { id: 'u2' };
    userService.getUserById.mockResolvedValue(user);
    const req = { params: { id: 'u2' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.getUserById, req, res, next);

    expect(userService.getUserById).toHaveBeenCalledWith('u2');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getUserById — propagates errors', async () => {
    userService.getUserById.mockRejectedValue(new Error('not found'));
    const req = { params: { id: 'x' } };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.getUserById, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('deleteUser — returns 200 on success', async () => {
    userService.deleteUser.mockResolvedValue(undefined);
    const req = { params: { id: 'u2' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.deleteUser, req, res, next);

    expect(userService.deleteUser).toHaveBeenCalledWith('u2');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteUser — propagates errors', async () => {
    userService.deleteUser.mockRejectedValue(new Error('fail'));
    const req = { params: { id: 'u2' } };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.deleteUser, req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('updateUser — returns updated user', async () => {
    const user = { id: 'u2', name: 'Charlie' };
    userService.updateUser.mockResolvedValue(user);
    const req = { params: { id: 'u2' }, body: { name: 'Charlie' } };
    const res = mockRes();
    const next = mockNext();

    await callController(userController.updateUser, req, res, next);

    expect(userService.updateUser).toHaveBeenCalledWith('u2', { name: 'Charlie' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateUser — propagates errors', async () => {
    userService.updateUser.mockRejectedValue(new Error('fail'));
    const req = { params: { id: 'u2' }, body: {} };
    const res = mockRes();
    const next = mockNext();
    await callController(userController.updateUser, req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── Staff Leave Controller ────────────────────────────────────────────────────

jest.mock('../../src/services/staffLeave.service');
const staffLeaveService = require('../../src/services/staffLeave.service');
const staffLeaveController = require('../../src/controllers/staffLeave.controller');

describe('staffLeaveController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getAllUpcomingLeave — returns leave list with 200', async () => {
    const rows = [{ id: 'lv1' }];
    staffLeaveService.getAllUpcomingLeave.mockResolvedValue(rows);
    const res = mockRes();

    await callController(staffLeaveController.getAllUpcomingLeave, { }, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(staffLeaveService.getAllUpcomingLeave).toHaveBeenCalled();
  });

  it('getLeaveForStaff — passes the staff id from params', async () => {
    staffLeaveService.getLeaveForStaff.mockResolvedValue([{ id: 'lv1' }]);
    const res = mockRes();

    await callController(staffLeaveController.getLeaveForStaff, { params: { id: 'st1' } }, res, mockNext());

    expect(staffLeaveService.getLeaveForStaff).toHaveBeenCalledWith('st1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('createLeave — forwards dto, actor and ip; returns 201', async () => {
    const leave = { id: 'lv1' };
    staffLeaveService.createLeave.mockResolvedValue(leave);
    const res = mockRes();
    const req = {
      params: { id: 'st1' },
      body: { startDate: '2026-08-10', endDate: '2026-08-11' },
      user: { id: 'admin-1' },
      ip: '::1',
    };

    await callController(staffLeaveController.createLeave, req, res, mockNext());

    expect(staffLeaveService.createLeave).toHaveBeenCalledWith('st1', req.body, 'admin-1', '::1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('deleteLeave — passes the leave id from params', async () => {
    staffLeaveService.deleteLeave.mockResolvedValue(undefined);
    const res = mockRes();

    await callController(
      staffLeaveController.deleteLeave,
      { params: { leaveId: 'lv1' }, user: { id: 'admin-1' }, ip: '::1' },
      res,
      mockNext()
    );

    expect(staffLeaveService.deleteLeave).toHaveBeenCalledWith('lv1', 'admin-1', '::1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('createLeave — propagates service errors to next', async () => {
    const err = new Error('overlaps');
    staffLeaveService.createLeave.mockRejectedValue(err);
    const res = mockRes();
    const next = mockNext();

    await callController(
      staffLeaveController.createLeave,
      { params: { id: 'st1' }, body: {}, user: {}, ip: '::1' },
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(err);
  });
});
