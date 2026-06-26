'use strict';

/**
 * Unit tests for auth and user validators.
 * These cover the .refine() functions (the uncovered function paths)
 * and all schema validation branches.
 */

// ─── Auth Validator ───────────────────────────────────────────────────────────

const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../../src/validators/auth.validator');

describe('authValidator', () => {
  describe('registerSchema', () => {
    const valid = { name: 'Alice Smith', email: 'alice@example.com', password: 'Password1' };

    it('validates a correct payload', () => {
      expect(registerSchema.safeParse(valid).success).toBe(true);
    });

    it('lowercases the email', () => {
      const r = registerSchema.safeParse({ ...valid, email: 'ALICE@EXAMPLE.COM' });
      expect(r.success).toBe(true);
      expect(r.data.email).toBe('alice@example.com');
    });

    it('fails when name is too short (< 2 chars)', () => {
      expect(registerSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    });

    it('fails when name is missing', () => {
      const { name, ...rest } = valid;
      expect(registerSchema.safeParse(rest).success).toBe(false);
    });

    it('fails with an invalid email', () => {
      expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    });

    it('fails when password is too short (< 8 chars)', () => {
      expect(registerSchema.safeParse({ ...valid, password: 'Pass1' }).success).toBe(false);
    });

    it('fails when password has no uppercase letter', () => {
      expect(registerSchema.safeParse({ ...valid, password: 'password1' }).success).toBe(false);
    });

    it('fails when password has no lowercase letter', () => {
      expect(registerSchema.safeParse({ ...valid, password: 'PASSWORD1' }).success).toBe(false);
    });

    it('fails when password has no digit', () => {
      expect(registerSchema.safeParse({ ...valid, password: 'PasswordAbc' }).success).toBe(false);
    });

    it('allows optional phone', () => {
      expect(registerSchema.safeParse({ ...valid, phone: '+1234567890' }).success).toBe(true);
    });
  });

  describe('loginSchema', () => {
    const valid = { email: 'alice@example.com', password: 'anypassword' };

    it('validates a correct login payload', () => {
      expect(loginSchema.safeParse(valid).success).toBe(true);
    });

    it('fails when email is missing', () => {
      expect(loginSchema.safeParse({ password: 'pw' }).success).toBe(false);
    });

    it('fails when password is missing', () => {
      expect(loginSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
    });

    it('fails with invalid email format', () => {
      expect(loginSchema.safeParse({ email: 'invalid', password: 'pw' }).success).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('validates with a refresh token', () => {
      expect(refreshTokenSchema.safeParse({ refreshToken: 'tok' }).success).toBe(true);
    });

    it('fails when refreshToken is missing', () => {
      expect(refreshTokenSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('forgotPasswordSchema', () => {
    it('validates a valid email', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
    });

    it('fails with invalid email', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'bad' }).success).toBe(false);
    });

    it('fails when email is missing', () => {
      expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    const valid = {
      token: 'reset-token',
      password: 'NewPass1',
      confirmPassword: 'NewPass1',
    };

    it('validates when passwords match', () => {
      expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
    });

    it('fails when passwords do not match (exercises .refine function)', () => {
      const r = resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'Different1' });
      expect(r.success).toBe(false);
      expect(r.error.errors[0].path).toContain('confirmPassword');
      expect(r.error.errors[0].message).toBe('Passwords do not match');
    });

    it('fails when token is missing', () => {
      const { token, ...rest } = valid;
      expect(resetPasswordSchema.safeParse(rest).success).toBe(false);
    });

    it('fails when password is too weak', () => {
      expect(resetPasswordSchema.safeParse({ ...valid, password: 'weak', confirmPassword: 'weak' }).success).toBe(false);
    });
  });
});

// ─── User Validator ───────────────────────────────────────────────────────────

const { updateProfileSchema, changePasswordSchema } = require('../../src/validators/user.validator');

describe('userValidator', () => {
  describe('updateProfileSchema', () => {
    it('validates an empty update (all optional)', () => {
      expect(updateProfileSchema.safeParse({}).success).toBe(true);
    });

    it('validates name and phone', () => {
      expect(updateProfileSchema.safeParse({ name: 'Bob', phone: '+123' }).success).toBe(true);
    });

    it('allows nullable phone', () => {
      expect(updateProfileSchema.safeParse({ phone: null }).success).toBe(true);
    });

    it('fails when name is too short', () => {
      expect(updateProfileSchema.safeParse({ name: 'X' }).success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    const valid = {
      currentPassword: 'OldPass1',
      newPassword: 'NewPass1',
      confirmPassword: 'NewPass1',
    };

    it('validates when passwords match', () => {
      expect(changePasswordSchema.safeParse(valid).success).toBe(true);
    });

    it('fails when newPassword and confirmPassword differ (exercises .refine function)', () => {
      const r = changePasswordSchema.safeParse({ ...valid, confirmPassword: 'Mismatch1' });
      expect(r.success).toBe(false);
      expect(r.error.errors[0].message).toBe('Passwords do not match');
    });

    it('fails when currentPassword is missing', () => {
      const { currentPassword, ...rest } = valid;
      expect(changePasswordSchema.safeParse(rest).success).toBe(false);
    });

    it('fails when newPassword is too weak', () => {
      expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'weak', confirmPassword: 'weak' }).success).toBe(false);
    });
  });
});
