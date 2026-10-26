'use strict';

const request = require('supertest');

const preflight = (appInstance, origin) => {
  const req = request(appInstance)
    .options('/api/services')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'content-type');
  if (origin !== undefined) req.set('Origin', origin);
  return req;
};

const acao = (res) => res.headers['access-control-allow-origin'];

describe('CORS configuration (src/app.js)', () => {
  let app;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWildcard = process.env.CORS_ALLOW_WILDCARD;

  beforeAll(() => {
    app = require('../../src/app');
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalWildcard === undefined) delete process.env.CORS_ALLOW_WILDCARD;
    else process.env.CORS_ALLOW_WILDCARD = originalWildcard;
  });

  it('allows requests without an Origin header', async () => {
    const res = await preflight(app);
    expect(res.status).toBeLessThan(500);
  });

  it('allows exact allowlist origins (localhost entries exist outside production)', async () => {
    const res = await preflight(app, 'http://localhost:3000');
    expect(acao(res)).toBe('http://localhost:3000');
  });

  it('blocks unknown origins without throwing', async () => {
    const res = await preflight(app, 'https://evil.example.com');
    expect(acao(res)).toBeUndefined();
  });

  it('allows *.onrender.com while CORS_ALLOW_WILDCARD is enabled', async () => {
    const res = await preflight(app, 'https://salon-test.onrender.com');
    expect(acao(res)).toBe('https://salon-test.onrender.com');
  });

  it('allows *.vercel.app while CORS_ALLOW_WILDCARD is enabled', async () => {
    const res = await preflight(app, 'https://salon-test.vercel.app');
    expect(acao(res)).toBe('https://salon-test.vercel.app');
  });

  it('blocks wildcard origins when CORS_ALLOW_WILDCARD=false', async () => {
    process.env.CORS_ALLOW_WILDCARD = 'false';
    let strictApp;
    jest.isolateModules(() => {
      strictApp = require('../../src/app');
    });

    const res = await preflight(strictApp, 'https://salon-test.onrender.com');
    expect(acao(res)).toBeUndefined();
  });

  it('allows any localhost port in development', async () => {
    process.env.NODE_ENV = 'development';
    let devApp;
    jest.isolateModules(() => {
      devApp = require('../../src/app');
    });

    const res = await preflight(devApp, 'http://localhost:9999');
    expect(acao(res)).toBe('http://localhost:9999');
  });

  it('does not include the localhost fallback in production', async () => {
    process.env.NODE_ENV = 'production';
    let prodApp;
    jest.isolateModules(() => {
      prodApp = require('../../src/app');
    });

    // Port 9999 is not CLIENT_URL / BACKEND_URL / ALLOWED_ORIGINS, and the
    // non-production localhost fallback list must be gone in production.
    const res = await preflight(prodApp, 'http://localhost:9999');
    expect(acao(res)).toBeUndefined();
  });
});
