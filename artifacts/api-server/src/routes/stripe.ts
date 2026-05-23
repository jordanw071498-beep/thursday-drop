import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import {
  CreateCheckoutBody,
  CreateCheckoutResponse,
  CancelSubscriptionResponse,
  GetSubscriptionInfoResponse,
} from "@workspace/api-zod";
import { getUncachableStripeClient } from "../lib/stripe.js";
import { getAuthProfile } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

async function getPriceId(plan: "monthly" | "annual"): Promise<string | null> {
  try {
    const result = await db.execute(sql`
      SELECT pr.id AS price_id
      FROM stripe.prices pr
      JOIN stripe.products p ON pr.product = p.id
      WHERE p.active = true
        AND pr.active = true
        AND p.metadata->>'plan' = ${plan}
      ORDER BY pr.created DESC
      LIMIT 1
    `);
    return (result.rows[0]?.price_id as string) ?? null;
  } catch {
    return null;
  }
}

router.post("/stripe/create-checkout", async (req, res): Promise<void> => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { plan, user_id, email } = parsed.data;

  try {
    const stripe = await getUncachableStripeClient();

    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:3000";

    const priceId = await getPriceId(plan);

    let lineItems: any[];
    if (priceId) {
      lineItems = [{ price: priceId, quantity: 1 }];
    } else {
      const unitAmount = plan === "annual" ? 4999 : 499;
      lineItems = [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: `Thursday Drop Pro — ${plan === "annual" ? "Annual" : "Monthly"}`,
              description: "Unlimited watchlist, full archive access, weekly picks email",
            },
            unit_amount: unitAmount,
            recurring: { interval: plan === "annual" ? "year" : "month" },
          },
          quantity: 1,
        },
      ];
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,
      line_items: lineItems,
      metadata: { user_id, plan },
      success_url: `${baseUrl}/account?checkout=success`,
      cancel_url: `${baseUrl}/pricing`,
    });

    res.json(CreateCheckoutResponse.parse({ url: session.url }));
  } catch (err) {
    logger.error({ err }, "Stripe checkout error");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/stripe/cancel-subscription", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!profile.stripe_customer_id) {
    res.status(400).json({ error: "No active subscription found" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 1,
    });

    if (!subscriptions.data.length) {
      await db
        .update(profilesTable)
        .set({ is_pro: false })
        .where(eq(profilesTable.id, profile.id));
      res.json(
        CancelSubscriptionResponse.parse({
          success: true,
          message: "No active subscription found — account updated.",
        }),
      );
      return;
    }

    await stripe.subscriptions.cancel(subscriptions.data[0].id);

    await db
      .update(profilesTable)
      .set({ is_pro: false })
      .where(eq(profilesTable.id, profile.id));

    logger.info({ userId: profile.id }, "Subscription cancelled");
    res.json(
      CancelSubscriptionResponse.parse({
        success: true,
        message: "Subscription cancelled. Your Pro access has been removed.",
      }),
    );
  } catch (err) {
    logger.error({ err }, "Cancel subscription error");
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

router.get("/stripe/subscription-info", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!profile.stripe_customer_id || !profile.is_pro) {
    res.json(
      GetSubscriptionInfoResponse.parse({
        is_pro: profile.is_pro,
        plan_type: null,
        period_end: null,
        cancel_at_period_end: false,
      }),
    );
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 1,
      expand: ["data.items.data.price.product"],
    });

    if (!subscriptions.data.length) {
      res.json(
        GetSubscriptionInfoResponse.parse({
          is_pro: false,
          plan_type: null,
          period_end: null,
          cancel_at_period_end: false,
        }),
      );
      return;
    }

    const sub = subscriptions.data[0] as any;
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
    const product = sub.items?.data?.[0]?.price?.product;
    const planMeta = product?.metadata?.plan as string | undefined;

    const planType =
      planMeta === "annual" || interval === "year"
        ? "annual"
        : planMeta === "monthly" || interval === "month"
          ? "monthly"
          : null;

    res.json(
      GetSubscriptionInfoResponse.parse({
        is_pro: true,
        plan_type: planType,
        period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Subscription info error");
    res.json(
      GetSubscriptionInfoResponse.parse({
        is_pro: profile.is_pro,
        plan_type: null,
        period_end: null,
        cancel_at_period_end: false,
      }),
    );
  }
});

export default router;
