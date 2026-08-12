# No Fridge Spoil

A React, TypeScript, and Vite grocery inventory app with receipt scanning, expiry tracking, shopping lists, meal planning, and recipes.

## Project handover

Before substantial development, read [`docs/CURSOR_HANDOVER.md`](docs/CURSOR_HANDOVER.md).
It documents the current architecture, local/cloud data boundaries, receipt pipeline, security
invariants, verification gates, dirty-worktree warning, known gaps, and recommended continuation
order. Cursor also receives the concise always-on rule in
[`project-handover.mdc`](.cursor/rules/project-handover.mdc).

## Local development

Install dependencies and start the Vite frontend:

```powershell
npm install
npm run dev
```

The Vite dev server includes a local `/api/receipt-ocr` middleware that runs the same handler as Vercel. Use the full Vercel development server only when deployment parity is needed:

```powershell
npm run dev:full
```

Without Supabase variables the app deliberately runs in device-only mode. With them configured, verified authentication is required and Dexie becomes the offline cache for the active household.

## Accounts and cloud data

Customer accounts use Supabase Auth. Household data lives in Supabase Postgres behind Row Level Security, while the browser keeps an IndexedDB cache and durable sync outbox. The foundation migration creates users, households, memberships, household profiles, inventory, shopping items, meal plans, receipt usage, retention cleanup, and tenant policies.

1. Create a Supabase project.
2. Apply [`supabase/migrations/20260715000000_account_cloud_foundation.sql`](supabase/migrations/20260715000000_account_cloud_foundation.sql) with the Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

3. Add the local and deployed URLs to Supabase Auth URL Configuration. Include `http://127.0.0.1:5173` for local development and the production Vercel origin.
4. Configure custom SMTP before production email confirmation and password recovery traffic.
5. Enable Supabase CAPTCHA and review Auth rate limits before opening public signup.

Browser-safe values:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Server-only values:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
RATE_LIMIT_SALT=at-least-32-random-bytes
CRON_SECRET=a-different-long-random-value
```

Never give `SUPABASE_SECRET_KEY`, `RATE_LIMIT_SALT`, or `CRON_SECRET` a `VITE_` prefix. The secret key bypasses RLS and belongs only in server functions.

## Receipt OCR

Receipt scans use Azure Document Intelligence's `prebuilt-receipt` model through the Vercel Function at `/api/receipt-ocr`. The Azure key remains server-side and must never use a `VITE_` prefix.

Create an Azure Document Intelligence resource, then add these variables to Vercel for Development, Preview, and Production:

```text
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key
AZURE_DOCUMENT_INTELLIGENCE_COST_PER_PAGE_USD=current-price-for-your-region
```

For local development, put the two Azure variables in `.env`. For local Vercel development, pull the project environment after adding the variables:

```powershell
npx vercel env pull .env.local
npm run dev:full
```

The frontend uploads a compressed JPEG to the same-origin receipt-jobs function. The function verifies the Supabase session and household membership, atomically reserves user/household/IP quota, stores the upload in a private bucket, and creates a durable job. The signed-in client immediately starts that job and polls its status; the scheduled worker recovers abandoned and retryable jobs. Successful jobs record cost and outcome, remove known non-food purchases, and delete the source upload. Raw IP addresses are never stored; the function stores an HMAC-derived rate-limit bucket key.

The checked-in worker schedule runs once daily so `vercel.json` deploys on Vercel Hobby. Pro and Enterprise deployments can change `/api/receipt-worker` to `*/2 * * * *` for two-minute recovery without changing the immediate customer scan path.

## Retention and account lifecycle

- Customers can export cloud data together with unsynced device data from Profile.
- Receipt and usage retention are configurable within server-enforced limits.
- Account deletion requires email confirmation and is blocked when deleting an owner would affect another household member.
- `/api/maintenance` removes expired receipt, usage, and rate-limit rows daily. Vercel sends `CRON_SECRET` in the bearer authorization header for the configured cron invocation.
- OCR scans and estimated provider cost are summarized per user and household in Profile.

## Checks

```powershell
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run test:e2e
```

## Deployment

Vercel is the supported deployment target. The repository includes `vercel.json` for the Vite build, SPA routing, security headers, API functions, receipt-job recovery, and daily retention cleanup. A static-only deployment is not supported because account, household, and receipt processing require the server handlers under `api/`.

```powershell
npm run deploy:vercel
```

Run `npm run verify:release` for the device-only release gate. With the local Supabase stack running and `.env.local` configured, run `npm run verify:release:cloud` to add live authentication, tenant-isolation, quota, retention, and mobile account lifecycle verification.
