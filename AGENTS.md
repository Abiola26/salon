# AGENTS.md

Salon booking platform: `backend/` (Express + Prisma + PostgreSQL) and `frontend/` (Next.js App Router). Two independent npm packages — no root workspace; install/run from each directory. No monorepo tooling.

## Commands

```bash
# Backend (port 5000)
cd backend && npm install
npx prisma migrate dev          # apply migrations (dev)
npm run prisma:seed             # seed admin user only
npm run dev                     # nodemon
npm test                        # all jest tests (--forceExit)
npm run test:unit               # unit only, no DB
npm run test:coverage           # coverage (80% thresholds enforced)
npm run lint                    # eslint src --ext .js

# Frontend (port 3000)
cd frontend && npm install
npm run dev                     # next dev
npm run lint                    # eslint
npm run build                   # next build (also the typecheck gate)
npm run test                    # vitest run (jsdom + RTL)
npm run test:watch              # vitest watch
```

Run backend tests against a live PostgreSQL with a valid `backend/.env` (integration suite `__tests__/api.test.js` needs DB + seeded admin). Frontend tests are Vitest + React Testing Library under `frontend/src/**/__tests__`-style colocated `*.test.ts(x)` files (no network, no backend needed).

## Layout & flow

Backend layering (follow when adding endpoints):
`routes/` → `controllers/` (thin, `asyncHandler` + `ApiResponse`) → `services/` (business logic) → `repositories/` (Prisma) → Prisma.

- Zod validators in `src/validators/`; wire via `validate(schema)` middleware in routes. Validate every new body/query/params.
- Env is Zod-validated at boot in `src/config/env.js` — missing required vars crash startup with a JSON error.
- Money: Prisma `Decimal(10,2)` columns. Prefer integer cents end-to-end; avoid `parseFloat` on money.
- Appointment/payment status transitions are ad-hoc across create, webhook, cron, admin confirm — centralize changes carefully.
- Booking hours/slots: single source of truth `src/config/workingHours.js` (Mon–Sat 09:00–18:00, 30-min slots). Change slot logic there, not ad hoc.
- Slot writes are serialized: `createAppointment`/`rescheduleAppointment` run inside `prisma.$transaction` holding a per-date Postgres advisory lock (`pg_advisory_xact_lock(hashtext('salon:booking:<date>'))`), then call `checkSlotConflict(date, time, excludeId, staffId, durationMin, tx)` — duration-aware overlap, returns the conflicting row or null. Any new code path that writes slots must take the same lock, pass `service.duration`, and pass the tx client into repository methods (they all accept trailing `db = prisma`).
- Staff leave/blackout (Phase 5): `staff_leave` table (date-only inclusive ranges, migration `20261026000001_add_staff_leave`). `staffLeave.service.createLeave` takes the SAME per-date advisory locks (all dates ascending) BEFORE its guard reads, then rejects overlapping leave (409) and leave over live appointments (409 — reschedule first). `appointment.service` filters leave via `staffLeaveRepository.findStaffIdsOnLeave(date, tx)` in create (explicit + auto-assign), reschedule, and `getAvailableSlots` (returns `slots: []` + `onLeave: true` + `reason` — book page renders `reason` in the empty state). Booking paths that ignore this table will double-book onleave dates.
- Stripe webhook route (`/api/payments/webhook` and `/api/v1/payments/webhook`) is mounted with `express.raw` BEFORE `express.json` — do not reorder.
- Background jobs: `src/utils/scheduler.js` (node-cron) + `src/jobs/smsReminder.job.js`. Cron leaves open handles — jest uses `--forceExit` for this reason. All crons run with `timezone: SALON_TIMEZONE` (env, default `America/New_York`, IANA-validated at boot) — Render servers are UTC, so never rely on process TZ.
- Email: ALL mail flows through the `EmailQueue` table (`utils/emailQueue.js`). `sendEmail`/template helpers in `src/utils/email.js` only enqueue (never throw — mail failures never fail bookings/refunds/resets); `enqueueEmail` nudges `processEmailQueue()` immediately (latency ≈ direct send) and the every-2-minute cron retries up to 3 attempts total, then `FAILED`. Processor serializes via an in-process mutex + CAS claim on `(status, attempts)` — safe on single-instance Render only; if scaled horizontally, add a `SENDING` claim status instead. Booking confirmation + daily-reminder emails carry an `ics` column payload (RFC 5545 built by `utils/ics.js`, salon-local wall time → UTC via `zonedToUtc`); the processor attaches it as `appointment.ics` (`text/calendar; charset=utf-8`) only when present.

Frontend:
- App Router under `src/app/`; pages are mostly `"use client"` with TanStack Query + react-hook-form/zod.
- Shared axios client `src/lib/api.ts`: browser baseURL is `/api` (proxied by Next rewrites in `next.config.ts` to the backend); SSR/node uses `NEXT_PUBLIC_API_URL` or hardcoded prod URL. Do not point the browser client at `localhost:5000` directly.
- Auth state `src/store/useAuthStore.ts`: access token in memory only; user persisted to localStorage (`salon-auth-storage`) — the refresh token is no longer in JS at all (httpOnly cookie). Axios interceptor serializes 401 → cookie refresh → retry (single-flight queue).
- `frontend/src/proxy.ts` (Phase 2, migrated from `middleware.ts` to the Next 16 proxy convention) gates `/admin`, `/dashboard`, `/login`, `/register` by verifying the refresh cookie with WebCrypto HS256 (no jose dep). It reads `JWT_REFRESH_SECRET` — **same value as backend — set it as a server env var in Vercel** (not `NEXT_PUBLIC_`); if unset, the proxy falls back to cookie-presence gating (API still enforces real auth, so nothing is actually exposed — but admin role checks need the secret). Login redirect uses `?redirect=` (validated by `safeRedirect`).
- Admin routes have no server-side middleware — only per-page `useEffect` client redirects. Route protection is client-only today.

## Gotchas

- `frontend/.env.local.example` is gitignored (`frontend/.gitignore` has `.env*`). After a clean clone, create `frontend/.env.local` manually with `NEXT_PUBLIC_API_URL=http://localhost:5000/api` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `backend/.env` is required and gitignored; copy from `backend/.env.example`. Deposit is flat dollars via `DEPOSIT_AMOUNT` (not a percentage — older docs saying `DEPOSIT_PERCENTAGE` are wrong); boot validation requires it to parse to a positive number.
- Money: all payment math runs in integer cents through `src/utils/money.js` (`toCents`/`toDecimal2`). Charges are computed as `price − discountAmount − amountPaid` (discounts/points were historically never applied to charges — do not reintroduce float math); sub-$0.50 charges are rejected (Stripe minimum); a fully discounted booking is created with `paymentStatus: 'PAID'`.
- Refund contract (Phase 1): `initiateRefund` calls Stripe FIRST with idempotency key `refund:<paymentId>` (double-clicks converge on one refund), then `paymentRepository.processRefund` (CAS `SUCCEEDED→REFUNDED` + appointment balance recompute in one tx; returns null on duplicate → `alreadyProcessed: true`, no duplicate email/audit). The `charge.refunded` webhook routes through `processRefund` too, so Stripe-dashboard refunds self-heal the DB; PARTIAL dashboard refunds (`amount_refunded < amount`) are never applied automatically — they log an error for manual reconciliation. Refunds audit as `REFUND_PAYMENT`.
- Auth sessions (Phase 2): refresh tokens live in httpOnly cookie `salon_refresh` (`Path=/api`, `SameSite=Lax`, `Secure` in prod) AND in the `refresh_tokens` table (SHA-256 hash only — raw JWT never stored). Every refresh rotates (CAS-revoke old row, insert new); presenting an already-revoked token = reuse ⇒ all sessions for that user are revoked + warn log. Body token still accepted on `/auth/refresh-token` for API/Swagger clients; logout revokes the presented session (falls back to all sessions); password reset revokes all. API auth still reads ONLY the `Authorization` header (cookie is never accepted there → no CSRF surface). The `users.refreshToken` column was DROPPED in Phase 3 (migration `20261026000000`). Migrations: `20261025000000`, `20261025000001`, `20261025000002`.
- Soft deletes (Phase 3): `services`, `staff`, `coupons`, `users` have `deletedAt` — all repo find paths filter `deletedAt: null` (including `findById`), so deleted rows vanish from every lookup but appointment/payment/review/audit FKs keep resolving via Prisma relations. Deletes are `repo.softDelete` (NEVER `prisma.*.delete`). Coupon delete also mangles the unique code to `"<CODE> (deleted <id6>)"` to free the original; user delete ANONYMIZES (name `Deleted user`, email `<id8>@deleted.invalid`, phone null, fresh password hash, loyalty 0) + revokes all sessions — never hard-delete users, `Appointment.user` is `onDelete: Cascade` and would wipe appointments/payments/reviews. Migration `20261026000000_phase3_soft_delete_ops` also added `appointments(date, staffId, status)` + `email_queue(status, createdAt)` composite indexes and dropped the now-redundant singles.
- CORS: exact origins come from `CLIENT_URL`/`BACKEND_URL`/`ALLOWED_ORIGINS` (comma list) + localhost outside production; `*.onrender.com`/`*.vercel.app` wildcards work only while `CORS_ALLOW_WILDCARD` is `"true"` (current default). Once the real frontend origin is in `ALLOWED_ORIGINS`, set `CORS_ALLOW_WILDCARD=false`. Unit tests cover all branches in `__tests__/unit/cors.test.js`.
- Seeded admin: `admin@salon.com` / `Admin@123456` (dev/test defaults from `prisma/seed.js`; `ADMIN_EMAIL`/`ADMIN_PASSWORD` override, password must be ≥12 chars). Seed REFUSES production unless `ALLOW_PROD_SEED=1` and never seeds the default password in prod. `npm start` is `npx prisma migrate deploy && node src/server.js` — it does NOT seed. Do not expose or re-print these creds in UI or logs.
- The old slot unique constraint `@@unique([date, time, staffId, status], name: "unique_slot")` was REMOVED (migration `20261025000000_drop_flawed_unique_slot`): `status` in the key allowed PENDING+CONFIRMED double-books, and NULL `staffId` defeated it anyway. Slot exclusivity now comes only from the advisory-lock transaction above — do not re-add a unique index; use `prisma migrate dev` for any future constraint change.
- Migration history may NOT match a `db push`-built database: local dev DB already had `20260624000000`'s objects, so `migrate deploy` failed on `CREATE TYPE ... already exists`. Recovery pattern: verify all objects from the failed migration exist (information_schema/pg_type/pg_indexes), then `npx prisma migrate resolve --applied <migration_name>`, then `migrate deploy`. IMPORTANT: do the same `npx prisma migrate status` check against the Render database before the `migrate deploy` start script ships there, or deploys will crash-loop.
- Backend ESLint is legacy `.eslintrc` (ESLint 8, rules: semi, single quotes, eqeqeq, prefer-const, no-console warn). Frontend is flat `eslint.config.mjs` with several rules intentionally downgraded to warn — do not "fix" by raising them without team buy-in.
- Jest: `forceExit: true`, `detectOpenHandles: true`, 15s timeout. Coverage thresholds: 80% branches/functions/lines/statements globally.
- Prisma: migrations committed; generated client not. After schema change: `npx prisma migrate dev` then `npx prisma generate`.
- `prisma/cleanup.js` is a destructive reset (keeps admin + services/staff/coupons, deletes all other data). Do not run against production.
- Stripe agent skills live duplicated under `backend/.claude/skills/` and `backend/.agents/skills/`.
- Root README claims husky/lint-staged, docker-compose, ngrok.yml, and GitHub Actions CI — none of these exist in the tree. Trust package.json scripts and actual files, not the root README.
- Frontend date handling: `new Date("YYYY-MM-DD")` parses as UTC and can shift appointments a day in negative-offset timezones. Prefer explicit local parsing when touching date display/filter logic.
- React Query keys are inconsistent across pages (`["services"]` vs `["services-list"]` vs `["admin-services-list"]`) — be careful with cache invalidation; a shared key factory is a known improvement.
- `animate-shake` and `animate-zoomIn` are now defined in `globals.css` (Phase 4) with a `prefers-reduced-motion` opt-out. Frontend tests: Vitest + RTL — `vitest.setup.ts` manually runs `cleanup()` because vitest globals are disabled; axios interceptor tests reach into `api.interceptors.*.handlers[0]` (`{ fulfilled, rejected }` shape, not separate entries). `@types/node` was bumped to ^22 for vitest 5 peer requirements. SEO: `robots.ts`/`sitemap.ts`/per-route server layouts (public pages are client components — metadata lives in sibling `layout.tsx`), `NEXT_PUBLIC_SITE_URL` feeds `src/lib/site.ts` (metadataBase/JSON-LD); set it in Vercel for canonical URLs.

## Verification order

Backend: `npm run lint` → `npm run test:unit` → `npm test` (needs DB). Frontend: `npm run lint` → `npm run test` → `npm run build`.

## Known improvement phases (context)

A senior review divided work into: Phase 0 security patches — **done** (webhook idempotency via `payment.repository.processSucceeded`/`claimFailed`, booking race via advisory-lock transactions + overlap check + `unique_slot` removal, CORS allowlist behind `CORS_ALLOW_WILDCARD`, log redaction in `error.middleware`, open-redirect guard `frontend/src/lib/safeRedirect.ts`, seed hardening + demo creds removed, `start` runs `migrate deploy` without seeding), Phase 1 money/state-machine correctness — **done** (cents math via `utils/money.js`, discounts applied to charges, Stripe-first idempotent refunds with `processRefund` + appointment balance recompute, partial-refund manual policy, amount/currency integrity logs on webhooks, `REFUND_PAYMENT` audit enum migration `20261025000001`), Phase 2 auth/session — **done** (refresh-token table `refresh_tokens` with rotation+reuse detection via migration `20261025000002`, httpOnly `salon_refresh` cookie, cookie-based axios refresh, `frontend/src/proxy.ts` server-side route gating), Phase 3 ops — **done** (email queue wired into all call sites with immediate nudge + cron retries, `SALON_TIMEZONE` on all crons, soft deletes for services/staff/coupons/users with anonymizing user delete, composite indexes + `users.refreshToken` drop in migration `20261026000000`), Phase 4 frontend tests/a11y/SEO — **done** (Vitest + RTL suites for safeRedirect/useAuthStore/api interceptors/Navbar, Navbar dialog+menu aria/Escape, `role="alert"` error banners, animation keyframes, robots/sitemap/JSON-LD/per-route metadata, middleware→proxy rename), Phase 5a staff leave/blackout — **done** (migration `20261026000001`, `staffLeave.*` routes under `/api/staff/:id/leave` + admin overview `/api/staff/leave` (registered before `/staff/:id`), availability/create/reschedule integration, admin roster Time-Off dialog, audit actions `CREATE_STAFF_LEAVE`/`DELETE_STAFF_LEAVE`), Phase 5b calendar invites — **done** (`email_queue.ics` column migration `20261026000002`, `utils/ics.js` builder with DST-aware salon-local→UTC conversion, confirmation + reminder templates enqueue ICS, queue processor attaches `appointment.ics` when present); remaining Phase 5 candidates: month-picker/staff preference on booking, rebook/waitlist, gift cards, loyalty tiers. Prefer Phase 0/1 items when touching payments, bookings, or auth.
