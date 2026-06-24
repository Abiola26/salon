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
const performanceLogger = require('./middlewares/performance.middleware');

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
        'script-src': ['\'self\'', '\'unsafe-inline\''],
        'style-src': ['\'self\'', '\'unsafe-inline\''],
        'img-src': ['\'self\'', 'data:', 'https://images.unsplash.com', 'https://*.unsplash.com'],
      },
    },
  })
);
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));
app.use(helmet.permittedCrossDomainPolicies());

if (NODE_ENV === 'production') {
  app.use(
    helmet.hsts({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    })
  );
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        CLIENT_URL,
        'http://localhost:3000',
        'http://localhost:5000', // Swagger UI served from same port
      ];

      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      // In development, allow all localhost origins regardless of port
      if (NODE_ENV === 'development' && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
  })
);

// ─── Stripe Webhook — raw body MUST come before JSON parser ───────────────────
app.use(
  '/api/payments/webhook',
  express.raw({ type: 'application/json', limit: '5mb' }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  }
);
app.use(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json', limit: '5mb' }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  }
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(
  express.json({
    limit: '10kb',
    // Save raw body for Stripe webhook verification as backup
    verify: (req, res, buf) => {
      if (req.originalUrl.includes('/payments/webhook')) {
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

// ─── Performance Logging ─────────────────────────────────────────────────────
app.use('/api', performanceLogger);

// ─── API Docs ─────────────────────────────────────────────────────────────────
// Dynamically set the server URL based on the incoming request so Swagger
// "Execute" calls the correct host in both local dev and on Render.
app.use('/api-docs', swaggerUi.serve, (req, res, next) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const dynamicDoc = {
    ...swaggerDocument,
    servers: [
      { url: `${protocol}://${host}/api`, description: 'Current Server' },
      { url: 'http://localhost:5000/api', description: 'Local Development' },
    ],
  };
  swaggerUi.setup(dynamicDoc)(req, res, next);
});

// Redirect root to Swagger API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// ─── API Routes (v1 canonical + /api alias) ───────────────────────────────────
app.use('/api/v1', routes);
app.use('/api', routes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use(notFoundHandler);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
