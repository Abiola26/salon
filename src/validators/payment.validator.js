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
});

module.exports = { createPaymentIntentSchema };
