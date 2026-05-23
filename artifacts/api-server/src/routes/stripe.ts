import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { CreateCheckoutBody, CreateCheckoutResponse } from "@workspace/api-zod";
import { getUncachableStripeClient } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MONTHLY_PRICE = 1500;
const ANNUAL_PRICE = 12000;

router.post("/stripe/create-checkout", async (req, res): Promise<void> => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { plan, user_id, email } = parsed.data;

  try {
    const stripe = await getUncachableStripeClient();

    const baseUrl =
      process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: `Thursday Drop Pro — ${plan === "annual" ? "Annual" : "Monthly"}`,
              description: "Unlimited watchlist, full archive access, weekly picks email",
            },
            unit_amount: plan === "annual" ? ANNUAL_PRICE : MONTHLY_PRICE,
            recurring: {
              interval: plan === "annual" ? "year" : "month",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { user_id, plan },
      success_url: `${baseUrl}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
    });

    res.json(CreateCheckoutResponse.parse({ url: session.url }));
  } catch (err) {
    logger.error({ err }, "Stripe checkout error");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/stripe/webhook", async (req, res): Promise<void> => {
  const rawBody = req.body;

  try {
    const stripe = await getUncachableStripeClient();
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: any;

    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch {
        event = rawBody;
      }
    } else {
      event = rawBody;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;

      if (userId) {
        await db
          .update(profilesTable)
          .set({
            is_pro: true,
            stripe_customer_id: session.customer,
          })
          .where(eq(profilesTable.id, userId));
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      if (customerId) {
        await db
          .update(profilesTable)
          .set({ is_pro: false })
          .where(eq(profilesTable.stripe_customer_id, customerId));
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Stripe webhook error");
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;
