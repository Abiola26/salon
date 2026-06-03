# Salon Booking Management System — REST API

A scalable, production-ready REST API for a Hair Dressing Salon built with **Node.js**, **Express**, **PostgreSQL**, and **Prisma ORM**.

## Features

- 🔐 **JWT Authentication** — access + refresh tokens, forgot/reset password
- 👤 **Role-based Access** — Admin and Customer roles
- 💇 **Service Management** — full CRUD for salon services
- 📅 **Appointment Booking** — create, reschedule, cancel with **double-booking prevention**
- 💳 **Stripe Payments** — partial deposit or full payment, webhook handling
- 📧 **Email Notifications** — confirmation, reminder, payment receipt, cancellation
- ⏰ **Scheduled Jobs** — daily appointment reminders, auto-complete past appointments
- 📊 **Analytics Dashboard** — revenue, bookings, top services, monthly trends
- 🛡️ **Security** — Helmet, CORS, rate limiting, HPP, input validation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT + Bcrypt |
| Payments | Stripe |
| Validation | Zod |
| Email | Nodemailer |
| Logging | Winston + Morgan |
| Scheduling | node-cron |

---

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL database
- Stripe account (for payment features)

### 1. Clone & Install

```bash
git clone <repo-url>
cd salon-booking-api
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/salon_db"
JWT_ACCESS_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
EMAIL_USER=your@email.com
EMAIL_PASS=your_app_password
```

### 3. Database Setup

```bash
# Run migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Seed with demo data
npm run prisma:seed
```

### 4. Run

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

Server starts at: `http://localhost:5000`

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
