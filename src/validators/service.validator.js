'use strict';

const { z } = require('zod');

const createServiceSchema = z.object({
  name: z
    .string({ required_error: 'Service name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100),
  description: z
    .string({ required_error: 'Description is required' })
    .min(10, 'Description must be at least 10 characters'),
  duration: z
    .number({ required_error: 'Duration is required' })
    .int('Duration must be an integer')
    .positive('Duration must be positive')
    .max(480, 'Duration cannot exceed 480 minutes'),
  price: z
    .number({ required_error: 'Price is required' })
    .positive('Price must be positive')
    .multipleOf(0.01, 'Price can have at most 2 decimal places'),
  image: z.string().url('Image must be a valid URL').optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateServiceSchema = createServiceSchema.partial();

module.exports = { createServiceSchema, updateServiceSchema };
