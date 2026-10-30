'use strict';

const { z } = require('zod');

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phoneNumber: z.string().optional().nullable(),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: 'Current password is required' }),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and a number'
      ),
    confirmPassword: z.string({ required_error: 'Confirm password is required' }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  email: z.string().email('Email must be a valid email address').optional(),
  role: z.enum(['CUSTOMER', 'ADMIN'], { invalid_type_error: 'Role must be CUSTOMER or ADMIN' }).optional(),
  loyaltyPoints: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int('Loyalty points must be an integer').min(0, 'Loyalty points cannot be negative').optional()
  ),
  phoneNumber: z.string().trim().max(30, 'Phone number is too long').optional().nullable(),
});

module.exports = { updateProfileSchema, changePasswordSchema, adminUpdateUserSchema };
