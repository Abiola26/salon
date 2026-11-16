'use strict';

const { z } = require('zod');

const createPaymentIntentSchema = z.object({
  appointmentId: z
    .string({ required_error: 'Appointment ID is required' })
    .uuid('Invalid appointment ID'),
  paymentType: z.enum(['FULL', 'DEPOSIT'], {
    required_error: 'Payment type is required',
    invalid_type_error: 'Payment type must be FULL or DEPOSIT',
  }),
  giftCardCode: z
    .string()
    .trim()
    .min(8, 'Invalid gift card code')
    .max(40, 'Invalid gift card code')
    .optional(),
});

module.exports = { createPaymentIntentSchema };
