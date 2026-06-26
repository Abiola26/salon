'use strict';

/**
 * Unit tests for shared utility modules:
 *  - ApiError
 *  - ApiResponse
 *  - token (generateAccessToken, generateRefreshToken, verifyAccessToken,
 *            verifyRefreshToken, generateRandomToken, hashToken)
 *  - ttlCache (createTtlCache)
 */

// ─── ApiError ─────────────────────────────────────────────────────────────────

const ApiError = require('../../src/utils/ApiError');

describe('ApiError', () => {
  it('constructs with correct fields via constructor', () => {
    const err = new ApiError(400, 'Bad request', ['e1'], '');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad request');
    expect(err.errors).toEqual(['e1']);
    expect(err.success).toBe(false);
    expect(err.isOperational).toBe(true);
  });

  it('preserves provided stack trace', () => {
    const err = new ApiError(500, 'err', [], 'at Foo.bar (file.js:1:1)');
    expect(err.stack).toBe('at Foo.bar (file.js:1:1)');
  });

  it('captures stack automatically when no stack provided', () => {
    const err = new ApiError(500, 'err');
    // V8 captureStackTrace guarantees a non-empty stack string; the exact
    // format varies by Node version so we only assert presence.
    expect(typeof err.stack).toBe('string');
    expect(err.stack.length).toBeGreaterThan(0);
  });

  it('defaults errors to []', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.errors).toEqual([]);
  });

  describe('static factory methods', () => {
    it('badRequest — 400 with errors array', () => {
      const err = ApiError.badRequest('Invalid input', ['field required']);
      expect(err.statusCode).toBe(400);
      expect(err.errors).toEqual(['field required']);
    });

    it('badRequest — 400 with default empty errors', () => {
      const err = ApiError.badRequest('Bad');
      expect(err.statusCode).toBe(400);
      expect(err.errors).toEqual([]);
    });

    it('unauthorized — 401 with custom message', () => {
      const err = ApiError.unauthorized('No token');
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('No token');
    });

    it('unauthorized — 401 with default message', () => {
      const err = ApiError.unauthorized();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Unauthorized');
    });

    it('forbidden — 403', () => {
      const err = ApiError.forbidden('Access denied');
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('Access denied');
    });

    it('forbidden — 403 default message', () => {
      const err = ApiError.forbidden();
      expect(err.message).toBe('Forbidden');
    });

    it('notFound — 404', () => {
      const err = ApiError.notFound('User not found');
      expect(err.statusCode).toBe(404);
    });

    it('notFound — 404 default message', () => {
      const err = ApiError.notFound();
      expect(err.message).toBe('Resource not found');
    });

    it('conflict — 409', () => {
      const err = ApiError.conflict('Duplicate email');
      expect(err.statusCode).toBe(409);
    });

    it('unprocessable — 422 with errors', () => {
      const err = ApiError.unprocessable('Validation failed', ['field x']);
      expect(err.statusCode).toBe(422);
      expect(err.errors).toEqual(['field x']);
    });

    it('unprocessable — 422 with default empty errors', () => {
      const err = ApiError.unprocessable('fail');
      expect(err.errors).toEqual([]);
    });

    it('tooManyRequests — 429', () => {
      const err = ApiError.tooManyRequests('Slow down');
      expect(err.statusCode).toBe(429);
    });

    it('tooManyRequests — 429 default message', () => {
      const err = ApiError.tooManyRequests();
      expect(err.message).toBe('Too many requests');
    });

    it('internal — 500', () => {
      const err = ApiError.internal('Crash');
      expect(err.statusCode).toBe(500);
    });

    it('internal — 500 default message', () => {
      const err = ApiError.internal();
      expect(err.message).toBe('Internal server error');
    });
  });
});

// ─── ApiResponse ──────────────────────────────────────────────────────────────

const ApiResponse = require('../../src/utils/ApiResponse');

describe('ApiResponse', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };

  it('constructor sets fields correctly with data and meta', () => {
    const r = new ApiResponse(200, 'ok', { id: 1 }, { total: 10 });
    expect(r.success).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(r.message).toBe('ok');
    expect(r.data).toEqual({ id: 1 });
    expect(r.meta).toEqual({ total: 10 });
  });

  it('constructor omits data and meta when null', () => {
    const r = new ApiResponse(200, 'ok');
    expect(r).not.toHaveProperty('data');
    expect(r).not.toHaveProperty('meta');
  });

  it('constructor includes data but omits meta when meta is null', () => {
    const r = new ApiResponse(200, 'ok', { id: 1 });
    expect(r).toHaveProperty('data');
    expect(r).not.toHaveProperty('meta');
  });

  describe('ApiResponse.send', () => {
    it('calls res.status with correct code and res.json with response body', () => {
      const res = mockRes();
      ApiResponse.send(res, 200, 'Success', { id: 1 }, { total: 5 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Success', data: { id: 1 } })
      );
    });
  });

  describe('ApiResponse.ok', () => {
    it('sends 200 with data', () => {
      const res = mockRes();
      ApiResponse.ok(res, 'OK', { result: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { result: true } }));
    });

    it('sends 200 without data', () => {
      const res = mockRes();
      ApiResponse.ok(res, 'Done');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('sends 200 with meta', () => {
      const res = mockRes();
      ApiResponse.ok(res, 'List', [], { page: 1 });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: { page: 1 } }));
    });
  });

  describe('ApiResponse.created', () => {
    it('sends 201 with data', () => {
      const res = mockRes();
      ApiResponse.created(res, 'Created', { id: 'new' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 'new' } }));
    });
  });

  describe('ApiResponse.noContent', () => {
    it('sends 204 with empty body', () => {
      const res = mockRes();
      ApiResponse.noContent(res);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });
});

// ─── token utils ─────────────────────────────────────────────────────────────

// Set required JWT env vars before loading the module
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
} = require('../../src/utils/token');

describe('token utils', () => {
  const payload = { id: 'u1', role: 'USER' };

  describe('generateAccessToken / verifyAccessToken', () => {
    it('generates a valid JWT access token and verifies it', () => {
      const token = generateAccessToken(payload);
      expect(typeof token).toBe('string');
      const decoded = verifyAccessToken(token);
      expect(decoded.id).toBe('u1');
      expect(decoded.role).toBe('USER');
    });

    it('verifyAccessToken throws for a tampered token', () => {
      const token = generateAccessToken(payload);
      expect(() => verifyAccessToken(token + 'x')).toThrow();
    });

    it('verifyAccessToken throws for a refresh token', () => {
      const token = generateRefreshToken(payload);
      expect(() => verifyAccessToken(token)).toThrow();
    });
  });

  describe('generateRefreshToken / verifyRefreshToken', () => {
    it('generates a valid JWT refresh token and verifies it', () => {
      const token = generateRefreshToken(payload);
      const decoded = verifyRefreshToken(token);
      expect(decoded.id).toBe('u1');
    });

    it('verifyRefreshToken throws for an access token', () => {
      const token = generateAccessToken(payload);
      expect(() => verifyRefreshToken(token)).toThrow();
    });

    it('verifyRefreshToken throws for a tampered token', () => {
      const token = generateRefreshToken(payload);
      expect(() => verifyRefreshToken(token + 'bad')).toThrow();
    });
  });

  describe('generateRandomToken', () => {
    it('returns a 64-character hex string', () => {
      const token = generateRandomToken();
      expect(typeof token).toBe('string');
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique tokens', () => {
      const t1 = generateRandomToken();
      const t2 = generateRandomToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('hashToken', () => {
    it('returns a deterministic SHA-256 hex string', () => {
      const hash = hashToken('mytoken');
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64);
      expect(hashToken('mytoken')).toBe(hash); // deterministic
    });

    it('different inputs produce different hashes', () => {
      expect(hashToken('abc')).not.toBe(hashToken('xyz'));
    });
  });
});

// ─── ttlCache ─────────────────────────────────────────────────────────────────

const { createTtlCache } = require('../../src/utils/ttlCache');

describe('createTtlCache', () => {
  it('set and get returns a fresh value', () => {
    const cache = createTtlCache(5000);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });

  it('get returns null for unknown key', () => {
    const cache = createTtlCache(5000);
    expect(cache.get('missing')).toBeNull();
  });

  it('get returns null and evicts expired entry', () => {
    jest.useFakeTimers();
    const cache = createTtlCache(100);
    cache.set('k', 'v');
    jest.advanceTimersByTime(200);
    expect(cache.get('k')).toBeNull();
    jest.useRealTimers();
  });

  it('delete removes an entry', () => {
    const cache = createTtlCache(5000);
    cache.set('k', 'v');
    cache.delete('k');
    expect(cache.get('k')).toBeNull();
  });

  it('clear removes all entries', () => {
    const cache = createTtlCache(5000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  describe('getOrSet', () => {
    it('calls factory and caches result on miss', async () => {
      const cache = createTtlCache(5000);
      const factory = jest.fn().mockResolvedValue('computed');
      const result = await cache.getOrSet('k', factory);
      expect(result).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns cached value without calling factory on hit', async () => {
      const cache = createTtlCache(5000);
      cache.set('k', 'cached');
      const factory = jest.fn().mockResolvedValue('new');
      const result = await cache.getOrSet('k', factory);
      expect(result).toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('re-runs factory after TTL expiry', async () => {
      jest.useFakeTimers();
      const cache = createTtlCache(100);
      const factory = jest.fn().mockResolvedValue('fresh');
      await cache.getOrSet('k', factory);
      jest.advanceTimersByTime(200);
      await cache.getOrSet('k', factory);
      expect(factory).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });
});
