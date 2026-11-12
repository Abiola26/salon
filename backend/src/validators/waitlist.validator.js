'use strict';

const { z } = require('zod');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidDateOnly = (value) => {
  if (!DATE_ONLY.test(value)) return false;
  try {
    return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  } catch {
    return false;
  }
};

const dateOnlySchema = z
  .string({ required_error: 'Preferred date is required' })
  .refine(isValidDateOnly, { message: 'Date must be a valid YYYY-MM-DD date' });

const createWaitlistSchema = z.object({
  serviceId: z.string({ required_error: 'Service ID is required' }).uuid('Invalid service ID'),
  staffId: z.string().uuid('Invalid staff ID').optional().nullable(),
  preferredDate: dateOnlySchema,
  preferredTime: z
    .string()
    .regex(TIME_24H, 'Time must be in HH:MM 24-hour format (e.g. 10:30)')
    .optional()
    .nullable(),
  notes: z.string().trim().max(500, 'Notes must be at most 500 characters').optional().nullable(),
});

const toPositiveInt = (fallback, max) =>
  z.preprocess(
    (val) => (val === undefined || val === null || val === '' ? fallback : Number(val)),
    z.number().int().min(1).max(max)
  );

const waitlistQuerySchema = z.object({
  page: toPositiveInt(1, 100000),
  limit: toPositiveInt(20, 100),
  status: z.enum(['WAITING', 'NOTIFIED', 'CONVERTED', 'CANCELLED']).optional(),
  date: dateOnlySchema.optional(),
});

module.exports = { createWaitlistSchema, waitlistQuerySchema, isValidDateOnly };
