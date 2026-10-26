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
```

Run backend tests against a live PostgreSQL with a valid `backend/.env` (integration suite `__tests__/api.test.js` needs DB + seeded admin). Frontend has no test script.

## Layout & flow

Backend layering (follow when adding endpoints):
`routes/` → `controllers/` (thin, `asyncHandler` + `ApiResponse`) → `services/` (business logic) → `repositories/` (Prisma) → Prisma.

- Zod validators in `src/validators/`; wire via `validate(schema)` middleware in routes. Validate every new body/query/params.
- Env is Zod-validated at boot in `src/config/env.js` — missing required vars crash startup with a JSON error.
- Money: Prisma `Decimal(10,2)` columns. Prefer integer cents end-to-end; avoid `parseFloat` on money.
- Appointment/payment status transitions are ad-hoc across create, webhook, cron, admin confirm — centralize changes carefully.
- Booking hours/slots: single source of truth `src/config/workingHours.js` (Mon–Sat 09:00–18:00, 30-min slots). Change slot logic there, not ad hoc.
- Slot writes are serialized: `createAppointment`/`rescheduleAppointment` run inside `prisma.$transaction` holding a per-date Postgres advisory lock (`pg_advisory_xact_lock(hashtext('salon:booking:<date>'))`), then call `checkSlotConflict(date, time, excludeId, staffId, durationMin, tx)` — duration-aware overlap, returns the conflicting row or null. Any new code path that writes slots must take the same lock, pass `service.duration`, and pass the tx client into repository methods (they all accept trailing `db = prisma`).
- Stripe webhook route (`/api/payments/webhook` and `/api/v1/payments/webhook`) is mounted with `express.raw` BEFORE `express.json` — do not reorder.
- Background jobs: `src/utils/scheduler.js` (node-cron) + `src/jobs/smsReminder.job.js`. Cron leaves open handles — jest uses `--forceExit` for this reason.
- Email: `src/utils/email.js` (fire-and-forget with swallowed errors) and `src/utils/emailQueue.js` + `EmailQueue` table (retry queue exists but is not yet wired into call sites).

Frontend:
- App Router under `src/app/`; pages are mostly `"use client"` with TanStack Query + react-hook-form/zod.
- Shared axios client `src/lib/api.ts`: browser baseURL is `/api` (proxied by Next rewrites in `next.config.ts` to the backend); SSR/node uses `NEXT_PUBLIC_API_URL` or hardcoded prod URL. Do not point the browser client at `localhost:5000` directly.
- Auth state `src/store/useAuthStore.ts`: access token in memory only; refresh token + user persisted to localStorage (`salon-auth-storage`). Axios interceptor serializes 401 → refresh → retry (single-flight queue).
- Admin routes have no server-side middleware — only per-page `useEffect` client redirects. Route protection is client-only today.

## Gotchas

- `frontend/.env.local.example` is gitignored (`frontend/.gitignore` has `.env*`). After a clean clone, create `frontend/.env.local` manually with `NEXT_PUBLIC_API_URL=http://localhost:5000/api` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `backend/.env` is required and gitignored; copy from `backend/.env.example`. Deposit is flat dollars via `DEPOSIT_AMOUNT` (not a percentage — older docs saying `DEPOSIT_PERCENTAGE` are wrong).
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
- `animate-shake` and `animate-zoomIn` classes are referenced in TSX but not defined in `globals.css` — they are currently no-ops.

## Verification order

Backend: `npm run lint` → `npm run test:unit` → `npm test` (needs DB). Frontend: `npm run lint` → `npm run build`.

## Known improvement phases (context)

A senior review divided work into: Phase 0 security patches — **done** (webhook idempotency via `payment.repository.processSucceeded`/`claimFailed`/`claimRefunded`, booking race via advisory-lock transactions + overlap check + `unique_slot` removal, CORS allowlist behind `CORS_ALLOW_WILDCARD`, log redaction in `error.middleware`, open-redirect guard `frontend/src/lib/safeRedirect.ts`, seed hardening + demo creds removed, `start` runs `migrate deploy` without seeding), then Phase 1 money/state-machine correctness, Phase 2 auth/session (refresh-token table, httpOnly cookie, middleware.ts), Phase 3 ops (email queue wiring, cron timezone, soft deletes, indexes), Phase 4 frontend tests/a11y/SEO, Phase 5 product features. Prefer Phase 0/1 items when touching payments, bookings, or auth.
