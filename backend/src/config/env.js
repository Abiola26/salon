'use strict';

const { z } = require('zod');
const dotenv = require('dotenv');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('5000'),

  DATABASE_URL: z.string().nonempty(),

  JWT_ACCESS_SECRET: z.string().nonempty(),
  JWT_REFRESH_SECRET: z.string().nonempty(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_SALT_ROUNDS: z.string().default('12'),

  STRIPE_SECRET_KEY: z.string().nonempty(),
  STRIPE_WEBHOOK_SECRET: z.string().nonempty(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  DEPOSIT_AMOUNT: z.string().default('30'),

  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.string().default('587'),
  EMAIL_SECURE: z.string().default('false'),
  EMAIL_USER: z.string().nonempty(),
  EMAIL_PASS: z.string().nonempty(),
  EMAIL_FROM: z.string().default('Salon Bookings <no-reply@salonbookings.com>'),

  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().optional(),

  RATE_LIMIT_WINDOW_MS: z.string().default(String(15 * 60 * 1000)),
  RATE_LIMIT_MAX: z.string().default('100'),
  AUTH_RATE_LIMIT_MAX: z.string().default('10'),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  const formatted = parsedEnv.error.format();
  throw new Error(`Environment validation failed: ${JSON.stringify(formatted, null, 2)}`);
}

const env = parsedEnv.data;

module.exports = {
  NODE_ENV: env.NODE_ENV,
  PORT: Number(env.PORT),

  DATABASE_URL: env.DATABASE_URL,

  JWT: {
    ACCESS_SECRET: env.JWT_ACCESS_SECRET,
    REFRESH_SECRET: env.JWT_REFRESH_SECRET,
    ACCESS_EXPIRES_IN: env.JWT_ACCESS_EXPIRES_IN,
    REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN,
  },

  BCRYPT_SALT_ROUNDS: Number(env.BCRYPT_SALT_ROUNDS),

  STRIPE: {
    SECRET_KEY: env.STRIPE_SECRET_KEY,
    WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || null,
  },

  DEPOSIT_AMOUNT: Number(env.DEPOSIT_AMOUNT),

  EMAIL: {
    HOST: env.EMAIL_HOST,
    PORT: Number(env.EMAIL_PORT),
    SECURE: env.EMAIL_SECURE === 'true',
    USER: env.EMAIL_USER,
    PASS: env.EMAIL_PASS,
    FROM: env.EMAIL_FROM,
  },

  CLIENT_URL: env.CLIENT_URL,
  BACKEND_URL: env.BACKEND_URL || null,

  RATE_LIMIT: {
    WINDOW_MS: Number(env.RATE_LIMIT_WINDOW_MS),
    MAX: Number(env.RATE_LIMIT_MAX),
    AUTH_MAX: Number(env.AUTH_RATE_LIMIT_MAX),
  },
};
