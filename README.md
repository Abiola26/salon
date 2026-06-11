# Salon — Full-Stack Booking Platform

A production-ready hair salon booking system with a **Next.js** frontend and a **Node.js/Express** backend, connected to **PostgreSQL** via **Prisma ORM**.

---

## 📁 Project Structure

```
salon/
├── backend/      # Node.js REST API (Express + Prisma + PostgreSQL)
└── frontend/     # Next.js 14 App Router client
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| PostgreSQL | ≥ 14 |
| npm | ≥ 9 |

---

### Backend Setup

```bash
cd backend
cp .env.example .env          # Fill in your DATABASE_URL, JWT secrets, Stripe keys, etc.
npm install
npx prisma migrate dev        # Run all migrations
npm run prisma:seed           # Seed admin user, services, stylists & coupons
npm run dev                   # Start dev server on http://localhost:5000
```

**Key environment variables** (see `backend/.env.example`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | JWT signing key (access token) |
| `JWT_REFRESH_SECRET` | JWT signing key (refresh token) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `EMAIL_*` | SMTP settings for transactional emails |
| `TWILIO_*` | Twilio credentials for SMS reminders (optional) |
| `CLIENT_URL` | Frontend origin for CORS (default: `http://localhost:3000`) |

---

### Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local   # Set NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm install
npm run dev                         # Start on http://localhost:3000
```

---

## 🔑 Default Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@salon.com` | `Admin@123456` |

---

## ✨ Features

### Customer
- Browse services with live pricing and duration
- Book appointments with stylist selection and slot availability
- Apply coupon codes for discounts
- Redeem loyalty points at checkout
- Manage upcoming and past appointments from a personal dashboard
- Pay deposit or full amount via Stripe
- Leave reviews after completed appointments

### Admin
- Full dashboard with revenue analytics and appointment stats
- Manage services (CRUD) with active/inactive toggle
- Manage stylists — assign services, bio and photo
- Manage coupons — percentage or flat discounts with expiry dates and usage limits
- View and confirm/cancel all appointments

### Platform
- Email confirmations and cancellation notices
- Automated SMS reminders 2 hours before each appointment
- Daily appointment reminder emails (cron at 09:00)
- Hourly auto-complete for past confirmed appointments
- Email queue with retry logic (up to 3 attempts)
- Audit log for all admin actions
- Rate limiting and security headers (Helmet, HPP, CORS)
- Swagger API docs at `http://localhost:5000/api-docs`

---

## 🧪 Running Tests

```bash
cd backend
npm test              # Run all integration tests
npm run test:coverage # With coverage report and coverage thresholds
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

---

## 📚 Documentation

- `backend/README.md` — backend architecture, environment config, API usage, and tests
- `frontend/README.md` — frontend architecture, env setup, and deployment

---

## 🧰 Developer Setup

1. Install repo-level dependencies and Git hooks:

```bash
npm install
```

This installs `husky` and `lint-staged`, enabling pre-commit checks in the repository root.

After install, `git commit` will run lint-staged on changed files and prevent commits with lint failures.

2. Install backend dependencies:

```bash
cd backend
npm install
```

3. Install frontend dependencies:

```bash
cd frontend
npm install
```

4. Start the backend:

```bash
cd backend
npm run dev
```

4. Start the frontend:

```bash
cd frontend
npm run dev
```

---

## 🔧 Environment Variables

Backend env example: `backend/.env.example`

Frontend env example: `frontend/.env.local.example`

Important vars:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EMAIL_USER`, `EMAIL_PASS`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

---

## 🚀 Deployment

This repo is CI-ready with GitHub Actions in `.github/workflows/ci.yml`.

Deploy the frontend to Vercel, Netlify, or any Next.js platform, and the backend to any Node.js host.

### Docker

Use the provided Dockerfiles and compose setup for local container-based development:

```bash
docker compose up --build
```

The compose stack includes:
- `postgres` database
- `backend` API on `http://localhost:5000`
- `frontend` app on `http://localhost:3000`

Use `docker compose down` to stop the services.

---

## 🗄️ Database Schema Overview

| Model | Purpose |
|-------|---------|
| `User` | Customers and admins, stores loyalty points |
| `Staff` | Stylists with service assignments |
| `Service` | Bookable services with price and duration |
| `Appointment` | Core booking record with coupon and staff FK |
| `Coupon` | Promo codes (percentage or flat discount) |
| `Payment` | Stripe payment records per appointment |
| `Review` | One-per-appointment rating with comment |
| `AuditLog` | Admin action trail |
| `EmailQueue` | Reliable email delivery queue |

---

## 📦 Tech Stack

**Backend:** Node.js · Express · Prisma · PostgreSQL · JWT · Stripe · Twilio · Nodemailer · Winston · Zod · node-cron

**Frontend:** Next.js 14 · TypeScript · TailwindCSS · TanStack Query · Zustand · Stripe.js · Lucide Icons

## 🧪 Continuous Integration

This repository includes GitHub Actions CI in `.github/workflows/ci.yml`.

The workflow installs dependencies and runs:
- backend lint and tests
- frontend lint and build
