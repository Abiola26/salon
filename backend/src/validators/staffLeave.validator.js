'use strict';

const { z } = require('zod');

const dateStr = z
  .string({ required_error: 'Date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const createLeaveSchema = z
  .object({
    startDate: dateStr,
    endDate: dateStr,
    reason: z.string().min(2, 'Reason must be at least 2 characters').max(200).optional().nullable(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

module.exports = { createLeaveSchema };
