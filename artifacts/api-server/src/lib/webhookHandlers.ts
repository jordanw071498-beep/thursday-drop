import { eq, or } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { getUncachableStripeClient } from "./stripe.js";
import { logger } from "./logger.js";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "Payload must be a Buffer. Ensure webhook route is registered BEFORE express.json()."
      );
    }

    let event: any;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      try {
        const stripe = await getUncachableStripeClient();
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        logger.info({ eventType: event.type, eventId: event.id }, "Stripe webhook signature verified");
      } catch (err) {
        logger.error(
          { err, signaturePresent: !!signature, secretLength: webhookSecret.length },
          "Stripe webhook signature verification failed — check STRIPE_WEBHOOK_SECRET in Vercel matches the LIVE webhook signing secret"
        );
        throw new Error(`Webhook signature verification failed: ${err}`);
      }
    } else {
      logger.warn(
        { hasSecret: !!webhookSecret, hasSignature: !!signature },
        "Stripe webhook processing WITHOUT signature verification (dev mode or missing STRIPE_WEBHOOK_SECRET)"
      );
      try {
        event = JSON.parse(payload.toString());
      } catch {
        throw new Error("Could not parse webhook payload");
      }
    }

    logger.info({ eventType: event.type, eventId: event.id }, "Processing Stripe event");
    await WebhookHandlers.applyBusinessLogic(event);
  }

  static async applyBusinessLogic(event: any): Promise<void> {
    // ── checkout.session.completed ────────────────────────────────────────────
    // Primary path: session metadata carries user_id directly
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id as string | undefined;
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;

      logger.info(
        { sessionId: session.id, userId, customerId, subscriptionId, paymentStatus: session.payment_status },
        "checkout.session.completed received"
      );

      if (!userId) {
        logger.error(
          { sessionId: session.id, metadata: session.metadata },
          "checkout.session.completed missing user_id in metadata — cannot activate Pro"
        );
        return;
      }

      const [updated] = await db
        .update(profilesTable)
        .set({
          is_pro: true,
          stripe_customer_id: customerId ?? undefined,
          stripe_subscription_id: subscriptionId ?? undefined,
        })
        .where(eq(profilesTable.id, userId))
        .returning({ id: profilesTable.id, email: profilesTable.email });

      if (updated) {
        logger.info({ userId, email: updated.email, customerId, subscriptionId }, "Pro activated via checkout.session.completed");
      } else {
        logger.error({ userId, customerId }, "DB update for checkout.session.completed matched 0 rows — user not found");
      }
      return;
    }

    // ── customer.subscription.created ────────────────────────────────────────
    // Fallback path: fires alongside checkout.session.completed.
    // user_id is in subscription.metadata (stamped via subscription_data.metadata at checkout creation).
    // This activates Pro even if checkout.session.completed webhook fails (e.g. wrong signing secret on that attempt).
    if (event.type === "customer.subscription.created") {
      const subscription = event.data.object;
      const userId = subscription.metadata?.user_id as string | undefined;
      const customerId = subscription.customer as string | null;
      const subscriptionId = subscription.id as string;
      const status = subscription.status as string;

      logger.info(
        { subscriptionId, userId, customerId, status },
        "customer.subscription.created received"
      );

      if (status !== "active" && status !== "trialing") {
        logger.info({ subscriptionId, status }, "Subscription not yet active, skipping Pro activation");
        return;
      }

      if (!userId) {
        // No user_id in metadata — try to look up by customer ID as last resort
        if (customerId) {
          const [byCustomer] = await db
            .update(profilesTable)
            .set({ is_pro: true, stripe_subscription_id: subscriptionId })
            .where(eq(profilesTable.stripe_customer_id, customerId))
            .returning({ id: profilesTable.id, email: profilesTable.email });
          if (byCustomer) {
            logger.info({ customerId, subscriptionId, email: byCustomer.email }, "Pro activated via customer.subscription.created (by customer ID)");
          } else {
            logger.error({ customerId, subscriptionId }, "customer.subscription.created: no user found by customer ID either");
          }
        } else {
          logger.error({ subscriptionId }, "customer.subscription.created missing both user_id metadata and customer ID");
        }
        return;
      }

      const [updated] = await db
        .update(profilesTable)
        .set({
          is_pro: true,
          stripe_customer_id: customerId ?? undefined,
          stripe_subscription_id: subscriptionId,
        })
        .where(eq(profilesTable.id, userId))
        .returning({ id: profilesTable.id, email: profilesTable.email });

      if (updated) {
        logger.info({ userId, email: updated.email, subscriptionId }, "Pro activated via customer.subscription.created");
      } else {
        logger.error({ userId, subscriptionId }, "DB update for customer.subscription.created matched 0 rows");
      }
      return;
    }

    // ── customer.subscription.updated ────────────────────────────────────────
    // Handles reactivation (e.g. unpause, renewal after failed payment recovered)
    // and catches any status transitions we might have missed.
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const customerId = subscription.customer as string | null;
      const subscriptionId = subscription.id as string;
      const status = subscription.status as string;

      logger.info({ subscriptionId, customerId, status }, "customer.subscription.updated received");

      if (status === "active" || status === "trialing") {
        if (!customerId) return;
        const [updated] = await db
          .update(profilesTable)
          .set({ is_pro: true, stripe_subscription_id: subscriptionId })
          .where(eq(profilesTable.stripe_customer_id, customerId))
          .returning({ id: profilesTable.id, email: profilesTable.email });
        if (updated) {
          logger.info({ customerId, subscriptionId, email: updated.email }, "Pro reactivated via customer.subscription.updated");
        }
      }
      return;
    }

    // ── customer.subscription.deleted ────────────────────────────────────────
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = subscription.customer as string | null;
      const subscriptionId = subscription.id as string;

      logger.info({ subscriptionId, customerId }, "customer.subscription.deleted received");

      if (!customerId) {
        logger.error({ subscriptionId }, "customer.subscription.deleted missing customer ID");
        return;
      }

      const [updated] = await db
        .update(profilesTable)
        .set({ is_pro: false })
        .where(
          or(
            eq(profilesTable.stripe_customer_id, customerId),
            eq(profilesTable.stripe_subscription_id, subscriptionId),
          )
        )
        .returning({ id: profilesTable.id, email: profilesTable.email });

      if (updated) {
        logger.info({ customerId, subscriptionId, email: updated.email }, "Pro removed via customer.subscription.deleted");
      } else {
        logger.warn({ customerId, subscriptionId }, "customer.subscription.deleted: no matching user found");
      }
      return;
    }

    logger.info({ eventType: event.type }, "Unhandled Stripe event type — ignored");
  }
}
