import Stripe from "stripe";

export async function getUncachableStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
}

export async function getStripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY ?? "";
}
