import { getUncachableStripeClient } from "./stripeClient.js";

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log("Checking for existing Thursday Drop products…");

  const existing = await stripe.products.search({
    query: "metadata['app']:'thursday-drop' AND active:'true'",
  });

  if (existing.data.length > 0) {
    console.log("Products already exist:");
    for (const p of existing.data) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      for (const pr of prices.data) {
        const amt = (pr.unit_amount ?? 0) / 100;
        console.log(`  ${p.name} — $${amt}/${pr.recurring?.interval} (price: ${pr.id})`);
      }
    }
    console.log("Run with --force to recreate.");
    if (!process.argv.includes("--force")) {
      process.exit(0);
    }
  }

  console.log("Creating Pro Monthly product ($4.99/month CAD)…");
  const monthlyProduct = await stripe.products.create({
    name: "Thursday Drop Pro — Monthly",
    description: "Unlimited watchlist, full archive access, weekly picks email, advanced analytics.",
    metadata: { app: "thursday-drop", plan: "monthly" },
  });

  const monthlyPrice = await stripe.prices.create({
    product: monthlyProduct.id,
    unit_amount: 499,
    currency: "cad",
    recurring: { interval: "month" },
    metadata: { app: "thursday-drop", plan: "monthly" },
  });

  console.log(`  ✓ Created: ${monthlyProduct.id}  price: ${monthlyPrice.id}`);

  console.log("Creating Pro Annual product ($49.99/year CAD)…");
  const annualProduct = await stripe.products.create({
    name: "Thursday Drop Pro — Annual",
    description: "Everything in Monthly. Save 17% with annual billing.",
    metadata: { app: "thursday-drop", plan: "annual" },
  });

  const annualPrice = await stripe.prices.create({
    product: annualProduct.id,
    unit_amount: 4999,
    currency: "cad",
    recurring: { interval: "year" },
    metadata: { app: "thursday-drop", plan: "annual" },
  });

  console.log(`  ✓ Created: ${annualProduct.id}  price: ${annualPrice.id}`);

  console.log("\n✓ All products created. Webhooks will sync them to the database.");
  console.log("\nPrice IDs (save these):");
  console.log(`  Monthly: ${monthlyPrice.id}`);
  console.log(`  Annual:  ${annualPrice.id}`);

  process.exit(0);
}

createProducts().catch((err) => {
  console.error(err);
  process.exit(1);
});
