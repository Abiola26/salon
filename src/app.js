'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const hpp = require('hpp');

require('express-async-errors');

const { NODE_ENV, CLIENT_URL } = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes/index');
const { globalLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');

const app = express();

// ─── Trust Proxy (for rate limiting behind reverse proxies) ──────────────────
app.set('trust proxy', 1);

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https://images.unsplash.com', 'https://*.unsplash.com'],
      },
    },
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [CLIENT_URL, 'http://localhost:3000'];
      // Allow requests with no origin (curl, Postman, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
  })
);

// ─── Stripe Webhook — raw body MUST come before JSON parser ───────────────────
// The /api/payments/webhook route uses express.raw() inline, so nothing needed here.

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(
  express.json({
    limit: '10kb',
    // Save raw body for Stripe webhook verification
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith('/api/payments/webhook')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── HTTP Parameter Pollution prevention ─────────────────────────────────────
app.use(hpp());

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── HTTP Request Logging ─────────────────────────────────────────────────────
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
      skip: (req) => req.url === '/api/health',
    })
  );
}

// ─── Global Rate Limiter ──────────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ─── API Docs ─────────────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use(notFoundHandler);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
