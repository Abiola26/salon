# Salon Booking Platform — Frontend

React/Next.js frontend for the salon booking system.

## Overview

This application provides the customer-facing booking experience:
- service browsing and stylist selection
- appointment slot reservation
- Stripe payment checkout
- customer dashboard and reviews

## Architecture

- `app/` — Next.js App Router pages, layouts, and providers
- `components/` — reusable UI components and widgets
- `lib/` — API client, request utilities, and shared helpers
- `store/` — global state management with Zustand
- `public/` — static assets and images

## Getting Started

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment

Create `frontend/.env.local` from the template:

```bash
cp .env.local.example .env.local
```

Set the backend API URL and Stripe key:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

## API Integration

The frontend communicates with the backend using `fetch`/`axios` through `NEXT_PUBLIC_API_URL`.
Example request flow:

```js
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

## Available Scripts

- `npm run dev` — start the local development server
- `npm run build` — build the app for production
- `npm run start` — run the production build
- `npm run lint` — run ESLint checks

## Deployment

Build the app and deploy to Vercel, Netlify, or any Next.js-compatible host.

```bash
npm run build
npm run start
```

For Vercel, set `NEXT_PUBLIC_API_URL` in project environment variables.

### Docker

Build and run the frontend container locally:

```bash
docker build -t salon-frontend ./frontend
docker run -e NEXT_PUBLIC_API_URL=http://localhost:5000/api -p 3000:3000 salon-frontend
```

If using root compose, the frontend is available at `http://localhost:3000`.

## Notes

- The frontend expects the backend API at `NEXT_PUBLIC_API_URL`
- The client supports CSR and SSR where applicable
