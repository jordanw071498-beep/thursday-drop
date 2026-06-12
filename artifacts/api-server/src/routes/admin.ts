import { Router, type IRouter } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import {
  db,
  profilesTable,
  winesTable,
  releaseCyclesTable,
  alertsTable,
  watchlistItemsTable,
  watchlistCategoriesTable,
  emailSubscribersTable,
  passwordResetTokensTable,
} from "@workspace/db";
import {
  GetAdminStatsResponse,
  TriggerScrapeResponse,
  SendAlertsResponse,
  SendWeeklyPicksBody,
  SendWeeklyPicksResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { getAuthProfile } from "../lib/auth.js";

const router: IRouter = Router();

/** Looks up by session_token (Bearer header) and checks is_admin. Returns profile or null. */
async function requireAdmin(req: any) {
  const profile = await getAuthProfile(req);
  if (!profile?.is_admin) return null;
  return profile;
}

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [totalSubs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(emailSubscribersTable)
    .where(eq(emailSubscribersTable.subscribed, true));

  const [proSubs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profilesTable)
    .where(eq(profilesTable.is_pro, true));

  const [totalWines] = await db.select({ count: sql<number>`count(*)` }).from(winesTable);
  const [totalReleases] = await db.select({ count: sql<number>`count(*)` }).from(releaseCyclesTable);

  const [pendingAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(eq(alertsTable.announcement_alert_sent, false));

  const [realAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  const [testAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, true)));

  const realUsersRows = await db
    .selectDistinct({ user_id: alertsTable.user_id })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  const proCount = Number(proSubs?.count ?? 0);

  res.json(
    GetAdminStatsResponse.parse({
      total_subscribers: Number(totalSubs?.count ?? 0),
      pro_subscribers: proCount,
      mrr: proCount * 15,
      total_wines: Number(totalWines?.count ?? 0),
      total_releases: Number(totalReleases?.count ?? 0),
      pending_alerts: Number(pendingAlerts?.count ?? 0),
      pending_real_alerts: Number(realAlerts?.count ?? 0),
      pending_test_alerts: Number(testAlerts?.count ?? 0),
      pending_real_users: realUsersRows.length,
    }),
  );
});

router.get("/admin/alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await db
    .select({
      id: alertsTable.id,
      wine_name: alertsTable.wine_name,
      user_email: profilesTable.email,
      program_label: releaseCyclesTable.program_label,
      release_opens_at: releaseCyclesTable.release_opens_at,
      announcement_alert_sent: alertsTable.announcement_alert_sent,
      sent_at: alertsTable.sent_at,
      morning_alert_sent: alertsTable.morning_alert_sent,
      morning_sent_at: alertsTable.morning_sent_at,
      is_test: alertsTable.is_test,
      created_at: alertsTable.created_at,
    })
    .from(alertsTable)
    .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
    .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
    .innerJoin(profilesTable, eq(alertsTable.user_id, profilesTable.id))
    .orderBy(desc(alertsTable.created_at))
    .limit(100);

  res.json({
    alerts: rows.map((r) => ({
      ...r,
      release_opens_at: r.release_opens_at?.toISOString() ?? null,
      sent_at: r.sent_at?.toISOString() ?? null,
      morning_sent_at: r.morning_sent_at?.toISOString() ?? null,
      created_at: r.created_at.toISOString(),
    })),
  });
});

router.post("/admin/scrape", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const testMode = req.body?.testMode === true;

  try {
    const scraper = await import("../lib/scraper.js");
    const result = await scraper.runScraper({ testMode });
    res.json(TriggerScrapeResponse.parse({ success: true, message: result.message, wines_found: result.wines_found }));
  } catch (err) {
    logger.error({ err }, "Scraper error");
    res.json(TriggerScrapeResponse.parse({ success: false, message: "Scraper failed. Check logs.", wines_found: 0 }));
  }
});

router.post("/admin/send-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { confirm } = req.body ?? {};

  // Without confirm=true, return the real-user count so the frontend can show a warning
  if (!confirm) {
    const emailLib = await import("../lib/email.js");
    const counts = await emailLib.getPendingAlertCounts();
    res.json({
      success: false,
      requires_confirmation: true,
      pending_real_alerts: counts.real,
      pending_real_users: counts.realUsers,
      message: `${counts.real} real alerts pending for ${counts.realUsers} users. Send confirm=true to proceed.`,
    });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendPendingAlerts();
    res.json(SendAlertsResponse.parse({ success: true, sent: result.sent, message: `Sent ${result.sent} announcement alerts` }));
  } catch (err) {
    logger.error({ err }, "Send alerts error");
    res.json(SendAlertsResponse.parse({ success: false, sent: 0, message: "Failed to send alerts" }));
  }
});

router.post("/admin/send-morning-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendMorningAlerts();
    res.json({ success: true, sent: result.sent, message: `Sent ${result.sent} morning alerts` });
  } catch (err) {
    logger.error({ err }, "Send morning alerts error");
    res.json({ success: false, sent: 0, message: "Failed to send morning alerts" });
  }
});

router.post("/admin/send-test-mode-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendTestModeAlerts();
    res.json({
      success: true,
      sent: result.sent,
      adminEmail: result.adminEmail,
      message: result.sent > 0
        ? `Sent ${result.sent} test alerts to ${result.adminEmail}`
        : "No pending test alerts to send",
    });
  } catch (err: any) {
    logger.error({ err }, "Send test mode alerts error");
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/admin/test-alert", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { email } = req.body ?? {};
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendTestAlert(email);
    logger.info({ resendResponses: result.responses }, "Test alert Resend responses");
    res.json({
      success: result.sent > 0,
      sent: result.sent,
      message: `Sent ${result.sent} test emails to ${email}`,
      resend_responses: result.responses,
    });
  } catch (err: any) {
    logger.error({ err }, "Test alert error");
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const users = await db
    .select({
      id: profilesTable.id,
      email: profilesTable.email,
      is_pro: profilesTable.is_pro,
      is_admin: profilesTable.is_admin,
      stripe_customer_id: profilesTable.stripe_customer_id,
      stripe_subscription_id: profilesTable.stripe_subscription_id,
      created_at: profilesTable.created_at,
    })
    .from(profilesTable)
    .orderBy(desc(profilesTable.created_at))
    .limit(200);

  // Alert counts per user
  const alertCounts = await db
    .select({
      user_id: alertsTable.user_id,
      total: sql<number>`count(*)`,
      sent: sql<number>`sum(case when ${alertsTable.announcement_alert_sent} then 1 else 0 end)`,
    })
    .from(alertsTable)
    .groupBy(alertsTable.user_id);

  const alertCountMap = new Map(alertCounts.map((a) => [a.user_id, { total: Number(a.total), sent: Number(a.sent) }]));

  // Watchlist item counts per user
  const watchlistCounts = await db
    .select({ user_id: watchlistItemsTable.user_id, count: sql<number>`count(*)` })
    .from(watchlistItemsTable)
    .groupBy(watchlistItemsTable.user_id);

  const watchlistCountMap = new Map(watchlistCounts.map((w) => [w.user_id, Number(w.count)]));

  res.json({
    users: users.map((u) => ({
      ...u,
      created_at: u.created_at.toISOString(),
      alert_count: alertCountMap.get(u.id)?.total ?? 0,
      alert_sent_count: alertCountMap.get(u.id)?.sent ?? 0,
      watchlist_count: watchlistCountMap.get(u.id) ?? 0,
      webhook_fired: !!u.stripe_customer_id,
    })),
  });
});

router.patch("/admin/users/:id/stripe", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const targetId = req.params.id;
  const { stripe_customer_id, stripe_subscription_id } = req.body ?? {};

  if (stripe_customer_id !== undefined && typeof stripe_customer_id !== "string" && stripe_customer_id !== null) {
    res.status(400).json({ error: "stripe_customer_id must be a string or null" });
    return;
  }
  if (stripe_subscription_id !== undefined && typeof stripe_subscription_id !== "string" && stripe_subscription_id !== null) {
    res.status(400).json({ error: "stripe_subscription_id must be a string or null" });
    return;
  }

  const updateData: Partial<typeof profilesTable.$inferInsert> = {};
  if (stripe_customer_id !== undefined) (updateData as any).stripe_customer_id = stripe_customer_id || null;
  if (stripe_subscription_id !== undefined) (updateData as any).stripe_subscription_id = stripe_subscription_id || null;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Provide at least one of stripe_customer_id or stripe_subscription_id" });
    return;
  }

  const [updated] = await db
    .update(profilesTable)
    .set(updateData)
    .where(eq(profilesTable.id, targetId))
    .returning({
      id: profilesTable.id,
      email: profilesTable.email,
      stripe_customer_id: profilesTable.stripe_customer_id,
      stripe_subscription_id: profilesTable.stripe_subscription_id,
    });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logger.info({ targetId, updateData }, "Admin updated Stripe IDs for user");
  res.json({ success: true, user: updated });
});

router.post("/admin/users/:id/toggle-pro", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const targetId = req.params.id;
  const [current] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, targetId))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [updated] = await db
    .update(profilesTable)
    .set({ is_pro: !current.is_pro })
    .where(eq(profilesTable.id, targetId))
    .returning();

  res.json({ id: updated.id, email: updated.email, is_pro: updated.is_pro });
});

router.get("/admin/watchlists", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Fetch all watchlist items with user email
  const items = await db
    .select({
      id: watchlistItemsTable.id,
      user_id: watchlistItemsTable.user_id,
      user_email: profilesTable.email,
      user_is_pro: profilesTable.is_pro,
      wine_name: watchlistItemsTable.wine_name,
      producer: watchlistItemsTable.producer,
      vintage: watchlistItemsTable.vintage,
      match_type: watchlistItemsTable.match_type,
      created_at: watchlistItemsTable.created_at,
    })
    .from(watchlistItemsTable)
    .leftJoin(profilesTable, eq(watchlistItemsTable.user_id, profilesTable.id))
    .orderBy(desc(watchlistItemsTable.created_at));

  // Fetch all watchlist categories with user email
  const categories = await db
    .select({
      id: watchlistCategoriesTable.id,
      user_id: watchlistCategoriesTable.user_id,
      user_email: profilesTable.email,
      user_is_pro: profilesTable.is_pro,
      category: watchlistCategoriesTable.category,
      created_at: watchlistCategoriesTable.created_at,
    })
    .from(watchlistCategoriesTable)
    .leftJoin(profilesTable, eq(watchlistCategoriesTable.user_id, profilesTable.id))
    .orderBy(desc(watchlistCategoriesTable.created_at));

  // Group into per-user structure
  const userMap = new Map<string, {
    user_id: string;
    email: string;
    is_pro: boolean;
    items: typeof items;
    categories: typeof categories;
  }>();

  for (const row of items) {
    const uid = row.user_id ?? "unknown";
    if (!userMap.has(uid)) {
      userMap.set(uid, { user_id: uid, email: row.user_email ?? "unknown", is_pro: row.user_is_pro ?? false, items: [], categories: [] });
    }
    userMap.get(uid)!.items.push(row);
  }
  for (const row of categories) {
    const uid = row.user_id;
    if (!userMap.has(uid)) {
      userMap.set(uid, { user_id: uid, email: row.user_email ?? "unknown", is_pro: row.user_is_pro ?? false, items: [], categories: [] });
    }
    userMap.get(uid)!.categories.push(row);
  }

  const users = Array.from(userMap.values())
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((u) => ({
      ...u,
      items: u.items.map((i) => ({ ...i, created_at: i.created_at.toISOString() })),
      categories: u.categories.map((c) => ({ ...c, created_at: c.created_at.toISOString() })),
    }));

  res.json({
    users,
    total_items: items.length,
    total_categories: categories.length,
    total_users: users.length,
  });
});

router.post("/admin/seed-collectible-wines", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { seedCollectibleWines } = await import("../lib/collectible-wines-seed.js");
    const result = await seedCollectibleWines();
    res.json({ success: true, inserted: result.inserted });
  } catch (err) {
    logger.error({ err }, "Collectible wines seed error");
    res.status(500).json({ success: false, error: "Seed failed. Check logs." });
  }
});

router.post("/admin/seed-spirits", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { seedSpiritsSuggestions } = await import("../lib/spirits-seed.js");
    const result = await seedSpiritsSuggestions();
    res.json({ success: true, inserted: result.inserted });
  } catch (err) {
    logger.error({ err }, "Spirits seed error");
    res.status(500).json({ success: false, error: "Spirits seed failed. Check logs." });
  }
});

router.post("/admin/import-wikidata", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { importWikidata } = await import("../lib/wikidata.js");
    const result = await importWikidata();
    res.json({ success: true, total: result.total, by_entity: result.by_entity });
  } catch (err) {
    logger.error({ err }, "Wikidata import error");
    res.status(500).json({ success: false, error: "Wikidata import failed. Check logs." });
  }
});

router.post("/admin/morning-reminder-preview", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { wine_id, email } = req.body ?? {};
  if (!wine_id || typeof wine_id !== "number") {
    res.status(400).json({ error: "wine_id (number) is required" });
    return;
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendMorningReminderPreview(wine_id, email);
    res.json({ success: true, sent: result.sent, subject: result.subject });
  } catch (err: any) {
    logger.error({ err }, "Morning reminder preview error");
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/admin/send-picks", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SendWeeklyPicksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendWeeklyPicks(parsed.data.subject, parsed.data.body);
    res.json(SendWeeklyPicksResponse.parse({ success: true, sent: result.sent, message: `Sent to ${result.sent} Pro subscribers` }));
  } catch (err) {
    logger.error({ err }, "Send weekly picks error");
    res.json(SendWeeklyPicksResponse.parse({ success: false, sent: 0, message: "Failed to send weekly picks" }));
  }
});

// ── GET /admin/stripe-health ─────────────────────────────────────────────────
// Shows webhook configuration health so you can diagnose Pro activation failures.
router.get("/admin/stripe-health", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const webhookSecretSet = !!process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode = stripeKey.startsWith("sk_live_") ? "live" : stripeKey.startsWith("sk_test_") ? "test" : "unknown";

  const [usersWithCustomerId] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profilesTable)
    .where(sql`${profilesTable.stripe_customer_id} IS NOT NULL`);

  const [proUsersTotal] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profilesTable)
    .where(eq(profilesTable.is_pro, true));

  const [proWithStripe] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profilesTable)
    .where(
      and(
        eq(profilesTable.is_pro, true),
        sql`${profilesTable.stripe_customer_id} IS NOT NULL`,
      ),
    );

  const proUsersCount = Number(proUsersTotal?.count ?? 0);
  const proWithStripeCount = Number(proWithStripe?.count ?? 0);
  const webhookFiringCorrectly = proUsersCount === 0 || proWithStripeCount > 0;

  const warnings: string[] = [];
  if (!webhookSecretSet) {
    warnings.push("STRIPE_WEBHOOK_SECRET is not set — webhooks are processed WITHOUT signature verification");
  }
  if (stripeMode === "test") {
    warnings.push("Stripe is in TEST mode — use live keys in production");
  }
  if (stripeMode === "unknown") {
    warnings.push("STRIPE_SECRET_KEY not set or unrecognized format");
  }
  if (proUsersCount > 0 && proWithStripeCount === 0) {
    warnings.push(`${proUsersCount} Pro user(s) have no stripe_customer_id — webhooks have not fired successfully yet`);
  }

  logger.info({ webhookSecretSet, stripeMode, proUsersCount, proWithStripeCount }, "Stripe health check requested");

  res.json({
    webhook_secret_set: webhookSecretSet,
    stripe_mode: stripeMode,
    pro_users_total: proUsersCount,
    pro_users_with_stripe_id: proWithStripeCount,
    users_with_customer_id: Number(usersWithCustomerId?.count ?? 0),
    webhook_firing_correctly: webhookFiringCorrectly,
    warnings,
    instructions: {
      webhook_url: "Register https://<your-domain>/api/stripe/webhook in Stripe Dashboard → Webhooks",
      events_to_subscribe: [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ],
      env_var: "Set STRIPE_WEBHOOK_SECRET to the signing secret shown in the Stripe webhook dashboard",
    },
  });
});

// ── GET /admin/users/:id ──────────────────────────────────────────────────────
// Full user detail: profile, Stripe status, watchlist, alert history.
router.get("/admin/users/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const targetId = req.params.id;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, targetId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [watchlistItems, watchlistCategories, userAlerts] = await Promise.all([
    db
      .select({
        id: watchlistItemsTable.id,
        wine_name: watchlistItemsTable.wine_name,
        producer: watchlistItemsTable.producer,
        vintage: watchlistItemsTable.vintage,
        match_type: watchlistItemsTable.match_type,
        created_at: watchlistItemsTable.created_at,
      })
      .from(watchlistItemsTable)
      .where(eq(watchlistItemsTable.user_id, targetId))
      .orderBy(watchlistItemsTable.created_at),

    db
      .select({
        id: watchlistCategoriesTable.id,
        category: watchlistCategoriesTable.category,
        created_at: watchlistCategoriesTable.created_at,
      })
      .from(watchlistCategoriesTable)
      .where(eq(watchlistCategoriesTable.user_id, targetId))
      .orderBy(watchlistCategoriesTable.created_at),

    db
      .select({
        id: alertsTable.id,
        wine_name: alertsTable.wine_name,
        announcement_alert_sent: alertsTable.announcement_alert_sent,
        morning_alert_sent: alertsTable.morning_alert_sent,
        sent_at: alertsTable.sent_at,
        morning_sent_at: alertsTable.morning_sent_at,
        is_test: alertsTable.is_test,
        created_at: alertsTable.created_at,
      })
      .from(alertsTable)
      .where(eq(alertsTable.user_id, targetId))
      .orderBy(desc(alertsTable.created_at))
      .limit(200),
  ]);

  res.json({
    profile: {
      id: profile.id,
      email: profile.email,
      is_pro: profile.is_pro,
      is_admin: profile.is_admin,
      stripe_customer_id: profile.stripe_customer_id,
      stripe_subscription_id: profile.stripe_subscription_id,
      created_at: profile.created_at.toISOString(),
      stripe_status: profile.stripe_customer_id
        ? "webhook_received"
        : profile.is_pro
          ? "pro_manual_or_webhook_missed"
          : "free",
    },
    watchlist: {
      items: watchlistItems.map((i) => ({ ...i, created_at: i.created_at.toISOString() })),
      categories: watchlistCategories.map((c) => ({ ...c, created_at: c.created_at.toISOString() })),
      total: watchlistItems.length + watchlistCategories.length,
    },
    alerts: {
      total: userAlerts.length,
      sent: userAlerts.filter((a) => a.announcement_alert_sent).length,
      pending: userAlerts.filter((a) => !a.announcement_alert_sent).length,
      morning_sent: userAlerts.filter((a) => a.morning_alert_sent).length,
      items: userAlerts.map((a) => ({
        ...a,
        sent_at: a.sent_at?.toISOString() ?? null,
        morning_sent_at: a.morning_sent_at?.toISOString() ?? null,
        created_at: a.created_at.toISOString(),
      })),
    },
  });
});

// ── DELETE /admin/users/:id ───────────────────────────────────────────────────
// Hard-delete a user and all related data.
// Requires { confirm: true } in request body.
// If user is Pro, also requires { confirm_pro: true } as an extra safeguard.
router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const targetId = req.params.id;
  const { confirm, confirm_pro } = req.body ?? {};

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, targetId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Require explicit confirmation
  if (!confirm) {
    res.status(400).json({
      error: "Confirmation required",
      message: `You are about to permanently delete ${profile.email}. Send { confirm: true${profile.is_pro ? ", confirm_pro: true" : ""} } to proceed.`,
      user: { id: profile.id, email: profile.email, is_pro: profile.is_pro, has_stripe_id: !!profile.stripe_customer_id },
    });
    return;
  }

  // Extra guard for Pro users — they may have an active paid subscription
  if (profile.is_pro && !confirm_pro) {
    res.status(400).json({
      error: "Pro user confirmation required",
      message: `${profile.email} is a Pro subscriber${profile.stripe_customer_id ? " with a linked Stripe account" : " (manually set Pro, no Stripe link)"}. Also send { confirm_pro: true } to confirm deletion. Cancel their Stripe subscription in the Stripe dashboard first if applicable.`,
      user: { id: profile.id, email: profile.email, is_pro: profile.is_pro, stripe_customer_id: profile.stripe_customer_id },
    });
    return;
  }

  // Cascade delete in FK-safe order
  const [deletedAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(eq(alertsTable.user_id, targetId));

  const [deletedWatchlistItems] = await db
    .select({ count: sql<number>`count(*)` })
    .from(watchlistItemsTable)
    .where(eq(watchlistItemsTable.user_id, targetId));

  const [deletedWatchlistCats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(watchlistCategoriesTable)
    .where(eq(watchlistCategoriesTable.user_id, targetId));

  await db.delete(alertsTable).where(eq(alertsTable.user_id, targetId));
  await db.delete(watchlistItemsTable).where(eq(watchlistItemsTable.user_id, targetId));
  await db.delete(watchlistCategoriesTable).where(eq(watchlistCategoriesTable.user_id, targetId));
  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.user_id, targetId));
  await db.delete(profilesTable).where(eq(profilesTable.id, targetId));

  logger.info(
    {
      deletedUserId: targetId,
      deletedEmail: profile.email,
      wasPro: profile.is_pro,
      alertsDeleted: Number(deletedAlerts?.count ?? 0),
      watchlistItemsDeleted: Number(deletedWatchlistItems?.count ?? 0),
      watchlistCatsDeleted: Number(deletedWatchlistCats?.count ?? 0),
    },
    "Admin deleted user account",
  );

  res.json({
    success: true,
    deleted: {
      email: profile.email,
      was_pro: profile.is_pro,
      alerts: Number(deletedAlerts?.count ?? 0),
      watchlist_items: Number(deletedWatchlistItems?.count ?? 0),
      watchlist_categories: Number(deletedWatchlistCats?.count ?? 0),
    },
  });
});

export default router;
