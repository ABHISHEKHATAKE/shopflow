# Deploying ShopFlow (Vercel + Render)

Order: **database and Redis, then backend, then frontend.**

## 1. Render: Postgres
New > Postgres. Name `shopflow-db`. Copy the **Internal Database URL** (for the backend)
and the **External Database URL** (for seeding from your laptop).

## 2. Render: Key Value (Redis)
New > Key Value. Name `shopflow-redis`. Copy the **Internal** URL (starts with `redis://`).
Set the eviction policy to `noeviction` if the dashboard offers it (BullMQ needs it).

## 3. Render: backend Web Service
New > Web Service > connect your GitHub repo.

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install --include=dev && npm run build && npx prisma db push` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Internal Database URL from step 1 |
| `REDIS_URL` | Internal Key Value URL from step 2 |
| `JWT_ACCESS_SECRET` | long random string |
| `JWT_REFRESH_SECRET` | a different long random string |
| `CLIENT_URL` | your Vercel URL (add after step 5; redeploy) |
| `ORDER_EXPIRY_MINUTES` | `15` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | leave empty for mock mode |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 4. Seed the database (once)
From your laptop, in `backend/`:

    # macOS/Linux
    DATABASE_URL="<External Database URL>" npx tsx prisma/seed.ts
    # Windows PowerShell
    $env:DATABASE_URL="<External Database URL>"; npx tsx prisma/seed.ts

## 5. Vercel: frontend
1. Open `frontend/vercel.json` and replace `YOUR-BACKEND-NAME` with your Render service name. Commit and push.
2. Vercel > Add New > Project > import the repo.
3. Settings: Root Directory `frontend`, Framework Preset `Vite`, Build `npm run build`, Output `dist`.
4. Deploy. No environment variables needed: the `/api` rewrite forwards requests to Render.
5. Put the Vercel URL into `CLIENT_URL` on Render and redeploy the backend.

## 6. Razorpay (optional, real payments)
Set the three Razorpay variables on Render. In the Razorpay dashboard add a webhook:
`https://<your-backend>.onrender.com/api/webhooks/razorpay`, event `payment.captured`,
and use the same secret as `RAZORPAY_WEBHOOK_SECRET`.

## Free-tier caveats
- Free web services sleep after 15 minutes idle; the first request then takes about a minute.
- Free Postgres expires after 30 days. Free Key Value loses its data on restart.
- Open the site once before showing it to anyone to wake the backend.
