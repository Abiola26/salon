'use strict';

const { z } = require('zod');

const createReviewSchema = z.object({
  appointmentId: z
    .string({ required_error: 'appointmentId is required' })
    .uuid('Invalid appointment ID'),
  rating: z
    .number({ required_error: 'rating is required' })
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot exceed 5'),
  comment: z.string().max(1000, 'Comment cannot exceed 1000 characters').optional(),
});

module.exports = { createReviewSchema };
