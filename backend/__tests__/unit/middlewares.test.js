'use strict';

/**
 * Unit tests for auth and validate middlewares.
 * Covers all branch paths including error/success cases.
 */

// ─── validate middleware ──────────────────────────────────────────────────────

const { z } = require('zod');
const { validate } = require('../../src/middlewares/validate.middleware');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(2),
    age: z.number().int().positive(),
  });

  it('calls next() with no args on valid body and replaces req.body with parsed data', () => {
    const req = { body: { name: 'Alice', age: 25 } };
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledWith(); // no error arg
    expect(req.body).toEqual({ name: 'Alice', age: 25 });
  });

  it('calls next() with ApiError.unprocessable on invalid body (exercises error branch)', () => {
    const req = { body: { name: 'A', age: -1 } }; // name too short, age negative
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
        ]),
      })
    );
  });

  it('validates req.query when source is "query"', () => {
    const querySchema = z.object({ page: z.coerce.number().int().positive() });
    const req = { query: { page: '2' } };
    const res = mockRes();
    const next = jest.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query.page).toBe(2);
  });

  it('calls next with error when query validation fails', () => {
    const querySchema = z.object({ page: z.coerce.number().int().positive() });
    const req = { query: { page: 'abc' } };
    const res = mockRes();
    const next = jest.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });

  it('validates req.params when source is "params"', () => {
    const paramSchema = z.object({ id: z.string().uuid() });
    const req = { params: { id: '2b7b045e-4c73-455f-8647-75927ad9a647' } };
    const res = mockRes();
    const next = jest.fn();

    validate(paramSchema, 'params')(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

// ─── service.validator ──────────────────────────────────────────────────

const { createServiceSchema } = require('../../src/validators/service.validator');

describe('serviceValidator — price preprocessor branch', () => {
  const basePayload = {
    name: 'Haircut',
    description: 'A nice haircut service',
    duration: 30,
    image: null,
  };

  it('accepts price as a numeric string (exercises parseFloat branch)', () => {
    const r = createServiceSchema.safeParse({ ...basePayload, price: '25.00' });
    expect(r.success).toBe(true);
    expect(r.data.price).toBe(25);
  });

  it('accepts price as a number directly (exercises the non-string passthrough branch)', () => {
    // This covers the `val` (else) branch in: typeof val === 'string' ? parseFloat(val) : val
    const r = createServiceSchema.safeParse({ ...basePayload, price: 49.99 });
    expect(r.success).toBe(true);
    expect(r.data.price).toBe(49.99);
  });

  it('fails when price is zero or negative', () => {
    expect(createServiceSchema.safeParse({ ...basePayload, price: 0 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...basePayload, price: -5 }).success).toBe(false);
  });
});

// ─── authenticate middleware ──────────────────────────────────────────────────

jest.mock('../../src/config/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// We need real token signing to test JWT validation
process.env.JWT_ACCESS_SECRET = 'test-secret-middleware';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_SECRET = 'test-refresh-middleware';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

const { generateAccessToken } = require('../../src/utils/token');
const { prisma } = require('../../src/config/db');
const { authenticate } = require('../../src/middlewares/auth.middleware');

describe('authenticate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next with unauthorized error when authorization header is missing', async () => {
    const req = { headers: {} };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Access token is required' })
    );
  });

  it('calls next with unauthorized when header does not start with "Bearer "', async () => {
    const req = { headers: { authorization: 'Token abc123' } };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Access token is required' })
    );
  });

  it('calls next with "Invalid access token" for a malformed token', async () => {
    const req = { headers: { authorization: 'Bearer not.a.jwt' } };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Invalid access token' })
    );
  });

  it('calls next with "User no longer exists" when user is deleted from DB', async () => {
    const token = generateAccessToken({ id: 'u1', role: 'USER' });
    prisma.user.findUnique.mockResolvedValue(null);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'User no longer exists' })
    );
  });

  it('attaches user to req and calls next() with no args on valid token', async () => {
    const token = generateAccessToken({ id: 'u1', role: 'ADMIN' });
    const dbUser = { id: 'u1', name: 'Alice', email: 'a@b.com', role: 'ADMIN', phone: null };
    prisma.user.findUnique.mockResolvedValue(dbUser);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);

    expect(req.user).toEqual(dbUser);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with "Access token has expired" for a TokenExpiredError (exercises err.name branch)', async () => {
    // Sign a token that expired 1 second ago to force TokenExpiredError
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { id: 'u1', role: 'USER' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -1 } // already expired
    );

    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Access token has expired' })
    );
  });
});
