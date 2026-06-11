# Salon Booking Management System — REST API

A scalable REST API for a hair salon booking platform built with **Node.js**, **Express**, **PostgreSQL**, and **Prisma ORM**.

## Features

- 🔐 JWT authentication with access + refresh tokens
- 👤 Role-based access for Admin and Customer
- 💇 Service management with active/inactive control
- 📅 Appointment booking with double-book prevention
- 💳 Stripe payments and webhook handling
- 📧 Email notifications and retry queue
- ⏰ Scheduled jobs for reminders and auto-complete
- 📊 Analytics dashboard for revenue and bookings
- 🛡️ Security middleware and input validation

---

## Architecture

- `src/app.js` — Express app, middleware, routes, Swagger setup
- `src/server.js` — application entry point
- `src/routes/` — route definitions and versioned endpoints
- `src/controllers/` — thin request/response handlers
- `src/services/` — business logic and workflow orchestration
- `src/repositories/` — Prisma data access layer
- `src/validators/` — Zod schemas for request validation
- `src/middlewares/` — auth, error handling, rate limiting
- `src/utils/` — helpers for tokens, email, audit, scheduler
- `prisma/` — Prisma schema, migrations, and seed data

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL database
- Stripe account (for live/test payments)

### Install

```bash
git clone <repo-url>
cd backend
npm install
```

### Environment

Copy the environment template and update values:

```bash
cp .env.example .env
```

This backend validates the environment using Zod and will refuse to start if required values are missing or malformed.

Required values:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `BCRYPT_SALT_ROUNDS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EMAIL_HOST`
- `EMAIL_USER`
- `EMAIL_PASS`
- `CLIENT_URL`

### Database

```bash
npm run prisma:migrate
npm run prisma:generate
npm run prisma:seed
```

### Run locally

```bash
npm run dev
```

API base URL: `http://localhost:5000`

### Docker

Build and run the backend container locally:

```bash
docker build -t salon-backend ./backend
docker run --env-file .env -p 5000:5000 salon-backend
```

Or run the full stack with root compose:

```bash
docker compose up --build
```

### Health checks

- `GET /api/health`
- `GET /api/api-docs`

### Testing

```bash
npm run test:unit
npm test
npm run test:coverage
```

---

## API Usage Examples

Register a customer:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"Customer@123"}'
```

Login:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"Customer@123"}'
```

Fetch services:

```bash
curl http://localhost:5000/api/services
```

---

## Deployment

Deploy the backend to any Node.js host.

- set environment variables securely
- run `npm install`
- run `npm run prisma:migrate:prod`
- start with `npm start`

For Docker deployment, use a `Dockerfile` and connect to PostgreSQL with a secure `DATABASE_URL`.

---

## API Endpoints

### 🔐 Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | Login | Public |
| POST | `/api/auth/refresh-token` | Refresh access token | Public |
| POST | `/api/auth/logout` | Logout | 🔒 User |
| POST | `/api/auth/forgot-password` | Request reset email | Public |
| POST | `/api/auth/reset-password` | Reset password | Public |

### 👤 Users

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/users/profile` | Get own profile | 🔒 User |
| PUT | `/api/users/profile` | Update profile | 🔒 User |
| PUT | `/api/users/change-password` | Change password | 🔒 User |
| DELETE | `/api/users/profile` | Delete own account | 🔒 User |
| GET | `/api/users` | List all users | 👑 Admin |
| GET | `/api/users/:id` | Get user by ID | 👑 Admin |
| DELETE | `/api/users/:id` | Delete user | 👑 Admin |

### 💇 Services

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/services` | Get all services | Public |
| GET | `/api/services/:id` | Get service by ID | Public |
| POST | `/api/services` | Create service | 👑 Admin |
| PUT | `/api/services/:id` | Update service | 👑 Admin |
| DELETE | `/api/services/:id` | Delete service | 👑 Admin |

### 📅 Appointments

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/appointments` | Book appointment | 🔒 User |
| GET | `/api/appointments` | Get appointments | 🔒 User/Admin |
| GET | `/api/appointments/:id` | Get appointment | 🔒 User/Admin |
| PUT | `/api/appointments/:id` | Reschedule | 🔒 User/Admin |
| DELETE | `/api/appointments/:id` | Cancel | 🔒 User/Admin |
| PATCH | `/api/appointments/:id/confirm` | Confirm | 👑 Admin |

### 💳 Payments

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/payments/create-intent` | Create Stripe intent | 🔒 User |
| POST | `/api/payments/webhook` | Stripe webhook | Stripe |
| GET | `/api/payments` | All payments | 👑 Admin |
| GET | `/api/payments/:appointmentId` | Appointment payments | 🔒 User/Admin |

### 📊 Analytics

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/analytics/dashboard` | Dashboard stats | 👑 Admin |

---

## Project Structure

```
src/
├── config/           # DB, env, stripe, email, logger
├── controllers/      # Route handlers (thin layer)
├── services/         # Business logic
├── repositories/     # Prisma data access layer
├── routes/           # Express routers
├── middlewares/      # Auth, error, rate-limit, validate
├── validators/       # Zod schemas
├── utils/            # Helpers (token, email, scheduler)
├── app.js            # Express app setup
└── server.js         # Entry point
prisma/
├── schema.prisma     # Database schema
└── seed.js           # Demo data seeder
```

---

## Database Schema

```
users ──────┬──< appointments >──── services
            │         │
            └──< payments >─────────┘
```

---

## Stripe Webhook Testing

Install Stripe CLI and forward events locally:

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Trigger test events:

```bash
stripe trigger payment_intent.succeeded
```

---

## Demo Credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@salon.com | Admin@123456 |
| Customer | jane@example.com | Customer@123 |

---

## Security Features

- **Helmet** — sets secure HTTP headers
- **CORS** — configurable origin whitelist
- **Rate Limiting** — per-route limits (stricter on auth endpoints)
- **HPP** — HTTP parameter pollution prevention
- **Bcrypt** — password hashing (12 rounds)
- **JWT** — short-lived access tokens (15m) + long-lived refresh tokens (7d)
- **Zod** — strict input validation on all routes
- **Email enumeration prevention** — forgot-password always returns 200

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiry (default: 15m) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry (default: 7d) |
| `BCRYPT_SALT_ROUNDS` | Bcrypt rounds (default: 12) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `DEPOSIT_PERCENTAGE` | Deposit % of service price (default: 30) |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_USER` | SMTP user |
| `EMAIL_PASS` | SMTP password |
| `CLIENT_URL` | Frontend URL (for CORS + emails) |

---

## License

MIT
