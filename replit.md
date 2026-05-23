# Thursday Drop

Premium LCBO Vintages wine release tracker — weekly drop alerts, watchlist matching, and Pro subscriptions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed-products` — create Stripe products in Stripe dashboard (run once)
- Required env: `DATABASE_URL` — Supabase pooler connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL (Supabase) + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Auth: custom bcrypt, UUID session tokens, Bearer header
- Payments: Stripe (direct SDK, not stripe-replit-sync — Supabase incompatible)
- Email: Resend

## Where things live

- `artifacts/api-server/src/` — Express API
  - `routes/` — route handlers (auth, releases, wines, watchlist, stripe, email, admin)
  - `lib/stripe.ts` — Stripe client singleton
  - `lib/webhookHandlers.ts` — Stripe webhook business logic
  - `openapi.yaml` — contract source of truth
- `artifacts/thursday-drop/src/` — React+Vite frontend
  - `pages/` — Landing, Release, History, Watchlist, Pricing, Account, Admin
  - `lib/AuthContext.tsx` — auth state + refreshProfile
- `lib/db/` — Drizzle schema + migrations
- `lib/api-client-react/` — generated React Query hooks (do not edit)
- `lib/api-zod/` — generated Zod schemas (do not edit)
- `scripts/src/seed-products.ts` — one-time Stripe product seeder

## Architecture decisions

- `stripe-replit-sync` was removed: Supabase pooler lacks privileges to create `stripe.*` schema. Using direct Stripe SDK with signature verification via `STRIPE_WEBHOOK_SECRET` env var instead.
- Webhook route is registered BEFORE `express.json()` in `app.ts` — required for raw body buffer.
- Stripe checkout uses `price_data` inline pricing as fallback (since `stripe.prices` table won't exist on Supabase); actual price IDs created via `seed-products` script can be used once the `stripe` schema is set up separately.
- Custom bcrypt auth — no Supabase Auth, no Clerk. Session token in `profiles.session_token`, passed as `Authorization: Bearer <token>`.

## Product

- **Release page**: current Thursday LCBO Vintages drop with wine details (score, price, region, critic notes)
- **History**: past drops with searchable archive
- **Watchlist**: track wines by exact name, wine (any vintage), or producer — with match badges
- **Pricing**: Free (5 watchlist items) vs Pro ($4.99/month or $49.99/year CAD)
- **Account**: plan status, renewal date, cancel subscription, upgrade prompt
- **Admin**: seed/manage wine data

## Stripe setup

Stripe products exist in the dashboard:
- Monthly: `price_1TaPIuCuz944BQGrBsSKdL2n` ($4.99 CAD/month)
- Annual: `price_1TaPIvCuz944BQGrWEoPJSA1` ($49.99 CAD/year)

For production webhooks:
1. Set `STRIPE_WEBHOOK_SECRET` env var to the signing secret from Stripe dashboard
2. Register `https://<domain>/api/stripe/webhook` as webhook endpoint in Stripe
3. Subscribe to: `checkout.session.completed`, `customer.subscription.deleted`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT use `stripe-replit-sync` — its `runMigrations` fails on Supabase (no permission to create `stripe` schema).
- `pnpm --filter @workspace/db run push` must be run after any Drizzle schema changes.
- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml`.
- Webhook signature verification is skipped in development if `STRIPE_WEBHOOK_SECRET` is not set.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
