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

    it('allows optional phoneNumber', () => {
      expect(registerSchema.safeParse({ ...valid, phoneNumber: '+1234567890' }).success).toBe(true);
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
    it('passes when refreshToken is present', () => {
      expect(refreshTokenSchema.safeParse({ refreshToken: 'tok' }).success).toBe(true);
    });

    it('allows a missing refreshToken (httpOnly cookie takes precedence)', () => {
      expect(refreshTokenSchema.safeParse({}).success).toBe(true);
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

    it('validates name and phoneNumber', () => {
      expect(updateProfileSchema.safeParse({ name: 'Bob', phoneNumber: '+123' }).success).toBe(true);
    });

    it('allows nullable phoneNumber', () => {
      expect(updateProfileSchema.safeParse({ phoneNumber: null }).success).toBe(true);
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

// ─── Staff Leave Validator ─────────────────────────────────────────────────────

const { createLeaveSchema } = require('../../src/validators/staffLeave.validator');

describe('staffLeaveValidator', () => {
  describe('createLeaveSchema', () => {
    it('validates a well-formed range', () => {
      const r = createLeaveSchema.safeParse({
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        reason: 'Vacation',
      });
      expect(r.success).toBe(true);
    });

    it('allows omitting the reason', () => {
      expect(createLeaveSchema.safeParse({ startDate: '2026-08-10', endDate: '2026-08-10' }).success).toBe(true);
    });

    it('rejects a malformed date', () => {
      const r = createLeaveSchema.safeParse({ startDate: '08/10/2026', endDate: '2026-08-15' });
      expect(r.success).toBe(false);
      expect(r.error.errors[0].message).toContain('YYYY-MM-DD');
    });

    it('rejects endDate before startDate (refine)', () => {
      const r = createLeaveSchema.safeParse({ startDate: '2026-08-15', endDate: '2026-08-10' });
      expect(r.success).toBe(false);
      expect(r.error.errors[0].message).toBe('End date must be on or after start date');
    });

    it('rejects a missing startDate', () => {
      expect(createLeaveSchema.safeParse({ endDate: '2026-08-15' }).success).toBe(false);
    });
  });
});

// ─── Phase 7: staff / coupon / admin user validators ─────────────────────────

const { createStaffSchema, updateStaffSchema } = require('../../src/validators/staff.validator');
const {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} = require('../../src/validators/coupon.validator');
const { adminUpdateUserSchema } = require('../../src/validators/user.validator');

describe('staffValidator', () => {
  it('accepts a minimal create payload', () => {
    expect(createStaffSchema.safeParse({ name: 'Jane Doe' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createStaffSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a non-URL image', () => {
    expect(createStaffSchema.safeParse({ name: 'Jane', image: 'not-a-url' }).success).toBe(false);
  });

  it('rejects invalid serviceIds', () => {
    expect(createStaffSchema.safeParse({ name: 'Jane', serviceIds: ['nope'] }).success).toBe(false);
  });

  it('allows a partial update payload', () => {
    expect(updateStaffSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('rejects more than 50 serviceIds', () => {
    const ids = Array.from({ length: 51 }, () => '00000000-0000-4000-8000-000000000000');
    expect(createStaffSchema.safeParse({ name: 'Jane', serviceIds: ids }).success).toBe(false);
  });
});

describe('couponValidator', () => {
  const valid = { code: 'SAVE10', discountType: 'PERCENTAGE', discountValue: 10 };

  it('accepts a valid create payload', () => {
    expect(createCouponSchema.safeParse(valid).success).toBe(true);
  });

  it('coerces numeric strings for discountValue', () => {
    const r = createCouponSchema.safeParse({ ...valid, discountValue: '15' });
    expect(r.success).toBe(true);
    expect(r.data.discountValue).toBe(15);
  });

  it('rejects a negative discountValue', () => {
    expect(createCouponSchema.safeParse({ ...valid, discountValue: -5 }).success).toBe(false);
  });

  it('rejects a percentage above 100 (refine)', () => {
    const r = createCouponSchema.safeParse({ ...valid, discountValue: 101 });
    expect(r.success).toBe(false);
    expect(r.error.errors[0].message).toBe('Percentage discount cannot exceed 100');
  });

  it('allows a flat discount above 100', () => {
    expect(
      createCouponSchema.safeParse({ code: 'FLAT150', discountType: 'FLAT', discountValue: 150 }).success
    ).toBe(true);
  });

  it('rejects an invalid code format', () => {
    expect(createCouponSchema.safeParse({ ...valid, code: 'BAD CODE!' }).success).toBe(false);
  });

  it('rejects an unknown discountType', () => {
    expect(createCouponSchema.safeParse({ ...valid, discountType: 'BOGO' }).success).toBe(false);
  });

  it('rejects endDate before startDate (refine)', () => {
    const r = createCouponSchema.safeParse({
      ...valid,
      startDate: '2026-02-01',
      endDate: '2026-01-01',
    });
    expect(r.success).toBe(false);
    expect(r.error.errors.some((e) => e.message === 'End date must be on or after the start date')).toBe(true);
  });

  it('accepts date strings and coerces them to Date', () => {
    const r = createCouponSchema.safeParse({
      ...valid,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(r.success).toBe(true);
    expect(r.data.startDate).toBeInstanceOf(Date);
  });

  it('allows a partial update payload', () => {
    expect(updateCouponSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('applies the percentage refine to partial updates', () => {
    expect(
      updateCouponSchema.safeParse({ discountType: 'PERCENTAGE', discountValue: 120 }).success
    ).toBe(false);
  });

  it('validateCouponSchema accepts numeric strings and coerces servicePrice', () => {
    const r = validateCouponSchema.safeParse({ code: 'SAVE10', servicePrice: '99.99' });
    expect(r.success).toBe(true);
    expect(r.data.servicePrice).toBe(99.99);
  });

  it('validateCouponSchema rejects a negative service price', () => {
    expect(validateCouponSchema.safeParse({ code: 'SAVE10', servicePrice: -1 }).success).toBe(false);
  });
});

describe('adminUpdateUserSchema', () => {
  it('accepts an empty update', () => {
    expect(adminUpdateUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a full valid update', () => {
    const r = adminUpdateUserSchema.safeParse({
      name: 'Anne Admin',
      email: 'anne@example.com',
      role: 'ADMIN',
      loyaltyPoints: 25,
      phoneNumber: '+15555550100',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid role', () => {
    expect(adminUpdateUserSchema.safeParse({ role: 'SUPERADMIN' }).success).toBe(false);
  });

  it('rejects negative loyaltyPoints', () => {
    expect(adminUpdateUserSchema.safeParse({ loyaltyPoints: -1 }).success).toBe(false);
  });

  it('coerces loyaltyPoints from a numeric string', () => {
    const r = adminUpdateUserSchema.safeParse({ loyaltyPoints: '50' });
    expect(r.success).toBe(true);
    expect(r.data.loyaltyPoints).toBe(50);
  });

  it('rejects an invalid email', () => {
    expect(adminUpdateUserSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});
