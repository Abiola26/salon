'use strict';

const { z } = require('zod');

const toPositiveInt = (fallback, max) =>
  z.preprocess(
    (val) => (val === undefined || val === null || val === '' ? fallback : Number(val)),
    z.number().int().min(1).max(max)
  );

const queueQuerySchema = z.object({
  page: toPositiveInt(1, 100000),
  limit: toPositiveInt(20, 100),
  status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
});

module.exports = { queueQuerySchema };
