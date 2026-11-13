# ShopFlow: E-commerce Order & Payment System

A full-stack e-commerce project focused on the hard parts of backend work: **overselling prevention, idempotent payments, order state machines, background jobs and caching.**

**Stack:** Node.js · Express · TypeScript · PostgreSQL (Prisma) · Redis · BullMQ · Razorpay · React (Vite) · Docker · GitHub Actions · Jest · k6

## Features

| Area | What it does |
|---|---|
| Auth | JWT access tokens (15 min) + rotating refresh tokens stored in Redis, bcrypt, role-based access (customer/admin) |
| Products | CRUD (admin), search, pagination, **Redis cache** with version-based invalidation |
| Cart | Per-user cart, quantity limits |
| Orders | Created from cart inside one DB transaction with **row-level locking** (`SELECT ... FOR UPDATE`) |
| Idempotency | `Idempotency-Key` header: retries and double clicks never create duplicate orders |
| State machine | `PENDING_PAYMENT → PAID → SHIPPED → DELIVERED`, plus `CANCELLED` / `EXPIRED`. Illegal transitions are rejected |
| Payments | Razorpay order creation, **HMAC signature verification**, **idempotent webhooks** (event id is a primary key) |
| Background jobs | BullMQ: auto-expire unpaid orders (releases stock), order-confirmation/invoice job, retries with exponential backoff, failed jobs retained (dead-letter) |
| Safety | Rate limiting (Redis), Helmet, Zod validation, CHECK constraint `stock >= 0`, soft-deleted products, price snapshots on order items |
| Quality | Unit tests, OpenAPI docs at `/docs`, structured logging (pino), CI pipeline, k6 load tests |

## Architecture decisions (talking points for interviews)

1. **Why lock rows instead of just `stock - 1`?** Two buyers of the last item would both read `stock = 1`. Locking product rows in sorted id order serialises them and avoids deadlocks. The DB CHECK constraint is a backstop.
2. **Why reserve stock at order creation, not payment?** The buyer is guaranteed the item while paying. A delayed BullMQ job releases it if payment doesn't arrive in `ORDER_EXPIRY_MINUTES`.
3. **Why two payment confirmation paths?** The browser callback is fast but unreliable (tab closed). The webhook is reliable but delayed. Both call `markPaid`, which is idempotent, so whichever comes first wins and the other is a no-op.
4. **Why does the webhook need the raw body?** Signatures are computed over exact bytes; parsing JSON first would break verification.
5. **Why Postgres over MongoDB?** Transactions, row locks and constraints are the core of this problem.
6. **Late payments:** if money arrives for an already-expired order, it is logged for refund instead of silently reopening the order. Automating refunds is a good extension.

## Quick start (Docker, easiest)

```bash
cp backend/.env.example backend/.env      # edit the two JWT secrets
docker compose up --build -d
docker compose exec backend npx tsx prisma/seed.ts
```

- App: http://localhost:8080
- API docs: http://localhost:4000/docs

## Local development (without Docker for the app)

```bash
docker compose up -d postgres redis

cd backend
cp .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev            # http://localhost:4000

cd ../frontend
npm install
npm run dev            # http://localhost:5173
```

Seeded accounts: `admin@shopflow.dev / Admin@123` and `user@shopflow.dev / User@1234`.

## Payments: mock mode vs Razorpay

With the Razorpay variables empty in `.env`, the app runs in **mock mode**: "Pay now" instantly marks the order paid, so you can demo everything without an account.

To use real Razorpay (test mode):
1. Create keys at the Razorpay dashboard and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Add a webhook pointing to `https://<your-host>/api/webhooks/razorpay` for `payment.captured` and set `RAZORPAY_WEBHOOK_SECRET` (use ngrok locally).

## Tests

```bash
cd backend && npm test
```

## Load testing (put these numbers on your resume)

Install [k6](https://k6.io), then:

```bash
# Raise rate limits for the test run (set in backend/.env and restart):
#   RATE_LIMIT_MAX=100000   AUTH_RATE_LIMIT_MAX=100000

# 1. Oversell test: 50 users race for the 5 "Limited Edition Keycaps" (product 9)
k6 run backend/k6/oversell.js
# Expect exactly 5 orders created (201) and the rest rejected (409). Stock never goes negative.

# 2. Cached read path: 100 concurrent users browsing
k6 run backend/k6/browse.js
```

Record your results and add them to the resume bullets below.

## Project layout

```
backend/
  prisma/            schema + seed
  src/
    routes/          auth, products, cart, orders (+admin), payments (+webhook)
    services/        orderService: locking, idempotency, state transitions
    queues/          BullMQ queues and workers
    middleware/      auth, RBAC, rate limiting
    lib/             state machine, Razorpay helpers, errors, logger
  tests/             Jest unit tests
  k6/                load tests
frontend/            React + Vite + TanStack Query
```

## Resume bullets (edit with your real numbers)

- Built a full-stack e-commerce platform (Node.js, TypeScript, PostgreSQL, Redis, React) with JWT auth, RBAC, and an order state machine.
- Eliminated overselling using transactional row-level locking and a DB CHECK constraint; verified with a k6 test of 50 concurrent buyers for 5 units: **exactly 5 orders succeeded**.
- Implemented Razorpay payments with HMAC signature verification and idempotent webhooks, so duplicate events and retries cannot double-process an order.
- Built async processing with BullMQ (delayed order expiry that releases stock, retries with exponential backoff, dead-letter handling).
- Cut product-list latency with Redis caching (p95 **X ms** at **Y req/s** under k6) and Redis-backed rate limiting.
- Containerised with Docker Compose; CI on GitHub Actions; OpenAPI docs; unit tests.

## Ideas to extend (optional)

- Integration tests with a real Postgres (Testcontainers) for the concurrency scenario
- Automatic refunds for late payments
- Email with Nodemailer/SES in the notification worker
- Product images on S3, Postgres full-text search
- Prometheus metrics endpoint
