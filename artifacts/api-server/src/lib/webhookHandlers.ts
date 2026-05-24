import { eq } from "drizzle-orm";
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
      } catch (err) {
        throw new Error(`Webhook signature verification failed: ${err}`);
      }
    } else {
      try {
        event = JSON.parse(payload.toString());
      } catch {
        throw new Error("Could not parse webhook payload");
      }
    }

    await WebhookHandlers.applyBusinessLogic(event);
  }

  static async applyBusinessLogic(event: any): Promise<void> {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      if (userId) {
        await db
          .update(profilesTable)
          .set({ is_pro: true, stripe_customer_id: session.customer })
          .where(eq(profilesTable.id, userId));
        logger.info({ userId }, "Set is_pro=true after checkout");
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
        logger.info({ customerId }, "Set is_pro=false after subscription deleted");
      }
    }
  }
}
