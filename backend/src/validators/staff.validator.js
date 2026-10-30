'use strict';

const { z } = require('zod');

const staffBodySchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  bio: z.string().max(2000).optional().nullable(),
  image: z.string().url('Image must be a valid URL').optional().nullable(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string().uuid('serviceIds must be valid UUIDs')).max(50).optional(),
});

const createStaffSchema = staffBodySchema;
const updateStaffSchema = staffBodySchema.partial();

module.exports = { createStaffSchema, updateStaffSchema };
