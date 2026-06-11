---
name: Stripe webhook setup
description: Why Pro upgrades weren't auto-activating and what the production setup requires.
---

## The issue
Patrick's profile had is_pro=true (manually set) but stripe_customer_id=NULL and stripe_subscription_id=NULL — the webhook never fired at all. ALL other manually-upgraded users also have NULL Stripe IDs.

## Root cause
STRIPE_WEBHOOK_SECRET is not set in the production environment (confirmed via GET /api/admin/stripe-health). Stripe is also in test mode (sk_test_... key). No webhook URL is registered in the Stripe dashboard.

## Why the code is correct
Checkout session creation stamps user_id in TWO places:
- session.metadata.user_id → checkout.session.completed handler
- subscription_data.metadata.user_id → customer.subscription.created handler (fallback)

The webhook handler gracefully degrades (processes without signature verification if secret is missing), but without the secret the LCBO domain can't receive real Stripe events.

## Production checklist
1. Set STRIPE_SECRET_KEY to sk_live_... in Vercel env vars
2. Register https://<domain>/api/stripe/webhook in Stripe Dashboard → Webhooks
3. Subscribe to: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
4. Set STRIPE_WEBHOOK_SECRET to the signing secret shown in the Stripe webhook page
5. Verify via GET /api/admin/stripe-health (webhook_firing_correctly should be true after first real subscriber)

**Why:** Without STRIPE_WEBHOOK_SECRET set in prod, the event is parsed but unsigned — and the endpoint must be publicly reachable (deployed) for Stripe to send events.
