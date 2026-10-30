'use strict';

const { z } = require('zod');

const toNumber = (val) => (typeof val === 'string' ? parseFloat(val) : val);

const couponFields = {
  code: z
    .string({ required_error: 'Coupon code is required' })
    .trim()
    .min(2, 'Coupon code must be at least 2 characters')
    .max(50, 'Coupon code must be at most 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code may only contain letters, numbers, "-" and "_"'),
  discountType: z.enum(['PERCENTAGE', 'FLAT'], {
    required_error: 'Discount type is required',
  }),
  discountValue: z.preprocess(
    toNumber,
    z
      .number({ required_error: 'Discount value is required' })
      .positive('Discount value must be positive')
      .max(100000, 'Discount value is too large')
  ),
  isActive: z.boolean().optional(),
  startDate: z.coerce.date({ invalid_type_error: 'Start date must be a valid date' }).optional().nullable(),
  endDate: z.coerce.date({ invalid_type_error: 'End date must be a valid date' }).optional().nullable(),
  maxUsage: z.preprocess(
    (val) => (val === null || val === '' ? undefined : toNumber(val)),
    z.number().int('Max usage must be an integer').positive('Max usage must be positive').optional()
  ).nullable(),
};

const applyCouponRules = (schema) =>
  schema
    .refine((d) => d.discountType !== 'PERCENTAGE' || d.discountValue === undefined || d.discountValue <= 100, {
      message: 'Percentage discount cannot exceed 100',
      path: ['discountValue'],
    })
    .refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, {
      message: 'End date must be on or after the start date',
      path: ['endDate'],
    });

const createCouponSchema = applyCouponRules(z.object(couponFields));
const updateCouponSchema = applyCouponRules(z.object(couponFields).partial());

const validateCouponSchema = z.object({
  code: z
    .string({ required_error: 'Coupon code is required' })
    .trim()
    .min(1, 'Coupon code is required')
    .max(50),
  servicePrice: z.preprocess(
    toNumber,
    z
      .number({ required_error: 'Service price is required' })
      .finite()
      .nonnegative('Service price cannot be negative')
  ),
});

module.exports = { createCouponSchema, updateCouponSchema, validateCouponSchema };
