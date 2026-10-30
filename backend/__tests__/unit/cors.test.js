'use strict';

const request = require('supertest');

// Loading the app in development/production makes config/email verify the
// SMTP transporter; stub it so those CORS variants don't leak sockets.
jest.mock('../../src/config/email', () => ({ sendMail: jest.fn(), verify: jest.fn() }));

const preflight = (appInstance, origin) => {
  const req = request(appInstance)
    .options('/api/services')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'content-type');
  if (origin !== undefined) req.set('Origin', origin);
  return req;
};

const acao = (res) => res.headers['access-control-allow-origin'];

/**
 * Load a fresh app instance with explicit env values. env.js snapshots the
 * environment at require time, so each variant needs its own module registry.
 * dotenv never overrides keys already present, which makes this deterministic
 * both locally (backend/.env exists) and in CI (no .env).
 */
const loadApp = (overrides = {}) => {
  let app;
  const saved = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];

  jest.isolateModules(() => {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    app = require('../../src/app');
  });

  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return app;
};

describe('CORS configuration (src/app.js)', () => {
  it('allows requests without an Origin header', async () => {
    const res = await preflight(loadApp({ NODE_ENV: 'test', CORS_ALLOW_WILDCARD: 'false' }));
    expect(res.status).toBeLessThan(500);
  });

  it('allows exact allowlist origins (localhost entries exist outside production)', async () => {
    const res = await preflight(
      loadApp({ NODE_ENV: 'test', CORS_ALLOW_WILDCARD: 'false' }),
      'http://localhost:3000'
    );
    expect(acao(res)).toBe('http://localhost:3000');
  });

  it('blocks unknown origins without throwing', async () => {
    const res = await preflight(
      loadApp({ NODE_ENV: 'test', CORS_ALLOW_WILDCARD: 'true' }),
      'https://evil.example.com'
    );
    expect(acao(res)).toBeUndefined();
  });

  it('allows *.onrender.com while CORS_ALLOW_WILDCARD is enabled', async () => {
    const res = await preflight(
      loadApp({ NODE_ENV: 'test', CORS_ALLOW_WILDCARD: 'true' }),
      'https://salon-test.onrender.com'
    );
    expect(acao(res)).toBe('https://salon-test.onrender.com');
  });

  it('allows *.vercel.app while CORS_ALLOW_WILDCARD is enabled', async () => {
    const res = await preflight(
      loadApp({ NODE_ENV: 'test', CORS_ALLOW_WILDCARD: 'true' }),
      'https://salon-test.vercel.app'
    );
    expect(acao(res)).toBe('https://salon-test.vercel.app');
  });

  it('blocks wildcard origins when CORS_ALLOW_WILDCARD=false', async () => {
    const res = await preflight(
      loadApp({ NODE_ENV: 'test', CORS_ALLOW_WILDCARD: 'false' }),
      'https://salon-test.onrender.com'
    );
    expect(acao(res)).toBeUndefined();
  });

  it('allows any localhost port in development', async () => {
    const res = await preflight(
      loadApp({ NODE_ENV: 'development', CORS_ALLOW_WILDCARD: 'false' }),
      'http://localhost:9999'
    );
    expect(acao(res)).toBe('http://localhost:9999');
  });

  it('does not include the localhost fallback in production', async () => {
    // Port 9999 is not CLIENT_URL / BACKEND_URL / ALLOWED_ORIGINS, and the
    // non-production localhost fallback list must be gone in production.
    const res = await preflight(
      loadApp({ NODE_ENV: 'production', CORS_ALLOW_WILDCARD: 'false' }),
      'http://localhost:9999'
    );
    expect(acao(res)).toBeUndefined();
  });
});
