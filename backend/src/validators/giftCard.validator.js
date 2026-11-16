'use strict';

const { z } = require('zod');

const optionalText = (max, label) =>
  z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined),
      z.string().max(max, `${label} must be at most ${max} characters`).optional()
    );

const createGiftCardSchema = z.object({
  amount: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
    z
      .number({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a number' })
      .finite('Amount must be a valid number')
  ),
  recipientName: optionalText(100, 'Recipient name'),
  recipientEmail: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined),
      z.string().email('Invalid recipient email').max(255).optional()
    ),
  notes: optionalText(500, 'Notes'),
});

const giftCardQuerySchema = z.object({
  page: z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? 1 : Number(value)),
    z.number().int().min(1).max(100000)
  ),
  limit: z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? 20 : Number(value)),
    z.number().int().min(1).max(100)
  ),
  status: z.enum(['ACTIVE', 'DEPLETED', 'VOID']).optional(),
  search: z.string().trim().max(100).optional(),
});

const validateGiftCardSchema = z.object({
  code: z
    .string({ required_error: 'Gift card code is required' })
    .trim()
    .min(8, 'Invalid gift card code')
    .max(40, 'Invalid gift card code'),
});

const idParamSchema = z.object({
  id: z.string().uuid('Invalid gift card ID'),
});

module.exports = {
  createGiftCardSchema,
  giftCardQuerySchema,
  validateGiftCardSchema,
  idParamSchema,
};
