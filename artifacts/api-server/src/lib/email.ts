import { Resend } from "resend";
import { eq, and, gte, lt, isNotNull, inArray, sql } from "drizzle-orm";
import {
  db,
  alertsTable,
  profilesTable,
  winesTable,
  releaseCyclesTable,
  emailSubscribersTable,
} from "@workspace/db";
import { logger } from "./logger";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  return new Resend(apiKey);
}

const FROM_ALERTS = "Thursday Drop <alerts@thursdaydrop.ca>";
const FROM_PICKS = "Thursday Drop <alerts@thursdaydrop.ca>";
const BASE_URL = "https://thursdaydrop.ca";

// ─── Shared email layout helpers ─────────────────────────────────────────────

function tableRow(label: string, value: string | null | undefined, valueColor = "#F2EBD9"): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid rgba(184,134,11,0.18);color:#F2EBD9;opacity:0.5;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;width:38%;font-family:sans-serif;">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid rgba(184,134,11,0.18);color:${valueColor};font-size:14px;font-family:Georgia,serif;">${value}</td>
    </tr>`;
}

function emailWrapper(inner: string, unsubscribeToken?: string | null): string {
  const footerLinks = unsubscribeToken
    ? `<a href="${BASE_URL}/account" style="color:#B8860B;opacity:0.7;">Manage your watchlist</a> &nbsp;·&nbsp;
       <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color:#B8860B;opacity:0.5;">Unsubscribe from Thursday Drop alerts</a>`
    : `<a href="${BASE_URL}/account" style="color:#B8860B;opacity:0.7;">Manage your watchlist</a>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;">
<div style="max-width:600px;margin:0 auto;background:#1a040a;color:#F2EBD9;padding:40px 36px;">
  <p style="color:#B8860B;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-family:sans-serif;margin:0 0 36px;">Thursday Drop</p>
  ${inner}
  <div style="border-top:1px solid rgba(242,235,217,0.1);margin-top:40px;padding-top:20px;">
    <p style="color:#F2EBD9;opacity:0.3;font-size:11px;font-family:sans-serif;line-height:1.6;margin:0;">
      You're receiving this because you added this wine to your Thursday Drop watchlist.<br>
      ${footerLinks}
    </p>
    <p style="color:#F2EBD9;opacity:0.2;font-size:10px;font-family:sans-serif;line-height:1.5;margin:12px 0 0;">
      Thursday Drop is an independent service and is not affiliated with the LCBO or Vintages.
    </p>
  </div>
</div>
</body></html>`;
}

function formatReleaseDate(date: Date | null): string {
  if (!date) return "TBA";
  const d = new Date(date.getTime());
  return d.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// "June 12, 2026" — used in STATUS: Preview row
function formatOpensDate(date: Date | null): string | null {
  if (!date) return null;
  return new Date(date.getTime()).toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Program label badge — high contrast: white text on deep charcoal, gold accent border
function programBadge(label: string | null | undefined): string {
  if (!label) return "";
  return `<p style="display:inline-block;font-family:sans-serif;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#F2EBD9;background:#2a1020;border:1px solid rgba(184,134,11,0.55);padding:4px 10px;margin:0 0 16px;line-height:1.4;">${label}</p>`;
}

async function ensureUnsubscribeToken(profileId: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .update(profilesTable)
    .set({ unsubscribe_token: token })
    .where(eq(profilesTable.id, profileId));
  return token;
}

// ─── Wine entry type used in digest builders ──────────────────────────────────

interface WineEntry {
  id: number;
  wine_name: string;
  producer: string | null;
  region: string | null;
  vintage: string | null;
  score: unknown;
  price: unknown;
  qty_available: number | null;
  closing_date: string | null;
  buy_url: string | null;
  program_label: string | null;
  release_opens_at: Date | null;
}

// ─── Announcement Digest ──────────────────────────────────────────────────────

function formatPriceDisplay(price: unknown): string | null {
  if (price == null) return null;
  const n = parseFloat(String(price));
  if (isNaN(n)) return null;
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildAnnouncementDigestHtml(wines: WineEntry[], unsubscribeToken?: string | null): string {
  const cards = wines.map((wine) => {
    const buyUrl =
      wine.buy_url ?? `https://www.lcbo.com/en/search?q=${encodeURIComponent(wine.wine_name)}`;

    const score = wine.score != null ? Math.round(Number(wine.score)) : null;
    const priceStr = formatPriceDisplay(wine.price);

    // Ordering date block — gold + prominent for preview, muted for available
    let dateBlock = "";
    if (wine.release_opens_at) {
      const d = formatOpensDate(wine.release_opens_at);
      const dateLabel = d ?? "Next Thursday";
      dateBlock = `
        <div style="background:rgba(184,134,11,0.12);border:1px solid rgba(184,134,11,0.55);padding:14px 16px;margin:16px 0;">
          <div style="font-family:sans-serif;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#B8860B;margin-bottom:6px;">Ordering Opens</div>
          <div style="font-family:Georgia,serif;font-size:17px;color:#F2EBD9;line-height:1.3;">${dateLabel} <span style="color:#B8860B;white-space:nowrap;">at 8:30am ET</span></div>
        </div>`;
    } else if (wine.closing_date) {
      dateBlock = `
        <div style="background:rgba(242,235,217,0.04);border:1px solid rgba(242,235,217,0.14);padding:12px 16px;margin:16px 0;">
          <div style="font-family:sans-serif;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#F2EBD9;opacity:0.38;margin-bottom:5px;">Ordering Closes</div>
          <div style="font-family:Georgia,serif;font-size:15px;color:#F2EBD9;opacity:0.7;line-height:1.3;">${wine.closing_date}</div>
        </div>`;
    }

    // Secondary details shown below the CTA (below the fold on mobile)
    const secondaryRows = [
      tableRow("Vintage", wine.vintage),
      tableRow("Region", wine.region),
      wine.qty_available ? tableRow("Qty available", `${wine.qty_available} bottles`) : "",
    ].filter(Boolean).join("");

    return `
    <div style="padding:20px 0 0;border-top:1px solid rgba(242,235,217,0.1);">
      ${programBadge(wine.program_label)}
      <h2 style="color:#F2EBD9;font-size:21px;line-height:1.3;margin:0 0 4px;font-family:Georgia,serif;">${wine.wine_name}</h2>
      ${wine.producer
        ? `<p style="color:#B8860B;font-size:12px;margin:0 0 16px;font-family:sans-serif;letter-spacing:0.03em;">${wine.producer}</p>`
        : `<div style="margin-bottom:16px;"></div>`}

      <table style="width:100%;border-collapse:collapse;border-bottom:1px solid rgba(184,134,11,0.18);padding-bottom:2px;margin-bottom:0;">
        <tr>
          <td style="width:50%;vertical-align:top;padding:0 10px 16px 0;border-right:1px solid rgba(184,134,11,0.2);">
            <div style="font-family:sans-serif;font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F2EBD9;opacity:0.4;margin-bottom:5px;">Score</div>
            <div style="font-family:Georgia,serif;line-height:1;color:#B8860B;">
              <span style="font-size:38px;">${score ?? "—"}</span><span style="font-size:15px;opacity:0.75;margin-left:3px;">pts</span>
            </div>
          </td>
          <td style="width:50%;vertical-align:top;padding:0 0 16px 12px;">
            <div style="font-family:sans-serif;font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F2EBD9;opacity:0.4;margin-bottom:5px;">Price</div>
            <div style="font-family:Georgia,serif;font-size:38px;line-height:1;color:#F2EBD9;">${priceStr ?? "—"}</div>
          </td>
        </tr>
      </table>

      ${dateBlock}

      <a href="${buyUrl}" style="display:block;background:#B8860B;color:#1a040a;padding:14px 22px;text-decoration:none;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-align:center;margin-bottom:24px;">Order on LCBO Vintages →</a>

      ${secondaryRows
        ? `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${secondaryRows}</table>`
        : ""}
    </div>`;
  }).join("");

  const heading =
    wines.length === 1 ? "New watchlist wine announced" : `${wines.length} new watchlist wines announced`;

  const inner = `
    <h1 style="color:#F2EBD9;font-size:20px;line-height:1.3;margin:0 0 18px;font-family:Georgia,serif;">${heading}</h1>
    ${cards}
  `;

  return emailWrapper(inner, unsubscribeToken);
}

// ─── Morning Reminder Digest ──────────────────────────────────────────────────

function buildMorningDigestHtml(wines: WineEntry[], unsubscribeToken?: string | null): string {
  const cards = wines.map((wine) => {
    const buyUrl =
      wine.buy_url ?? `https://www.lcbo.com/en/search?q=${encodeURIComponent(wine.wine_name)}`;
    const scoreDisplay = wine.score != null ? `${Math.round(Number(wine.score))} pts` : null;

    return `
    <div style="padding:28px 0;border-top:1px solid rgba(242,235,217,0.1);">
      ${programBadge(wine.program_label)}
      <h2 style="color:#F2EBD9;font-size:18px;line-height:1.35;margin:0 0 6px;font-family:Georgia,serif;">${wine.wine_name}</h2>
      ${wine.producer ? `<p style="color:#B8860B;font-size:12px;margin:0 0 20px;font-family:sans-serif;letter-spacing:0.02em;">${wine.producer}</p>` : `<div style="margin-bottom:20px;"></div>`}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        ${tableRow("Vintage", wine.vintage)}
        ${tableRow("Region", wine.region)}
        ${tableRow("Score", scoreDisplay, "#B8860B")}
        ${tableRow("Price", wine.price ? `$${wine.price}` : null)}
        ${tableRow("Qty available", wine.qty_available ? `${wine.qty_available} bottles` : null)}
        ${tableRow("Closes", wine.closing_date)}
      </table>
      <a href="${buyUrl}" style="display:inline-block;background:#B8860B;color:#1a040a;padding:11px 22px;text-decoration:none;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Order Now on LCBO Vintages →</a>
    </div>`;
  }).join("");

  const heading =
    wines.length === 1
      ? "Your watchlist wine opens for ordering today at 8:30am ET"
      : "Your watchlist wines open for ordering today at 8:30am ET";

  const inner = `
    <p style="color:#B8860B;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-family:sans-serif;margin:0 0 14px;font-weight:600;">Reminder: Ordering Opens Today</p>
    <h1 style="color:#F2EBD9;font-size:21px;line-height:1.3;margin:0 0 22px;font-family:Georgia,serif;">${heading}</h1>
    <div style="border-left:3px solid #B8860B;padding:12px 16px;background:rgba(184,134,11,0.08);margin-bottom:8px;">
      <p style="font-family:sans-serif;font-size:13px;color:#B8860B;font-weight:700;margin:0;">Ordering opens at 8:30am Eastern this morning.</p>
      <p style="font-family:sans-serif;font-size:12px;color:#F2EBD9;opacity:0.65;margin:4px 0 0;">Quantities are limited — have your LCBO account ready.</p>
    </div>
    ${cards}
  `;

  return emailWrapper(inner, unsubscribeToken);
}

// ─── Announcement Alert (digest — one email per user, all matching wines) ─────

export async function sendPendingAlerts(): Promise<{ sent: number }> {
  const rows = await db
    .select({
      alert: alertsTable,
      wine: winesTable,
      cycle: releaseCyclesTable,
      profile: profilesTable,
    })
    .from(alertsTable)
    .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
    .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
    .innerJoin(profilesTable, eq(alertsTable.user_id, profilesTable.id))
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  if (rows.length === 0) return { sent: 0 };

  // Group by user_id
  const byUser = new Map<string, typeof rows>();
  for (const row of rows) {
    const uid = row.alert.user_id;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(row);
  }

  const resend = getResendClient();
  let sent = 0;

  for (const [userId, userRows] of byUser) {
    const profile = userRows[0].profile;
    if (!profile?.email) continue;

    const alertIds = userRows.map((r) => r.alert.id);

    // Mark unsubscribed users done without sending
    if (profile.alerts_enabled === false) {
      await db
        .update(alertsTable)
        .set({ sent: true, sent_at: new Date(), announcement_alert_sent: true })
        .where(inArray(alertsTable.id, alertIds));
      continue;
    }

    // Deduplicate by wine_id (DB constraint prevents dups, but belt-and-suspenders)
    const seenWineIds = new Set<number>();
    const uniqueRows = userRows.filter((r) => {
      if (seenWineIds.has(r.wine.id)) return false;
      seenWineIds.add(r.wine.id);
      return true;
    });

    // Sort: newest program (highest programId) first, then by wine insertion order
    uniqueRows.sort((a, b) => {
      const pa = parseInt(a.cycle.program_id ?? "0");
      const pb = parseInt(b.cycle.program_id ?? "0");
      if (pb !== pa) return pb - pa;
      return a.wine.id - b.wine.id;
    });

    let unsubToken = profile.unsubscribe_token;
    if (!unsubToken) unsubToken = await ensureUnsubscribeToken(profile.id);

    const wines: WineEntry[] = uniqueRows.map((r) => ({
      id: r.wine.id,
      wine_name: r.wine.wine_name,
      producer: r.wine.producer,
      region: r.wine.region,
      vintage: r.wine.vintage,
      score: r.wine.score,
      price: r.wine.price,
      qty_available: r.wine.qty_available,
      closing_date: r.wine.closing_date,
      buy_url: r.wine.buy_url,
      program_label: r.cycle?.program_label ?? null,
      release_opens_at: r.cycle?.release_opens_at ?? null,
    }));

    const subject =
      wines.length === 1
        ? `${wines[0].wine_name} announced — your watchlist match`
        : `${wines.length} watchlist matches announced on Vintages`;

    try {
      await resend.emails.send({
        from: FROM_ALERTS,
        to: profile.email,
        subject,
        html: buildAnnouncementDigestHtml(wines, unsubToken),
      });

      await db
        .update(alertsTable)
        .set({ sent: true, sent_at: new Date(), announcement_alert_sent: true })
        .where(inArray(alertsTable.id, alertIds));

      sent++;
      logger.info({ userId, wines: wines.length, email: profile.email }, "Announcement digest sent");
    } catch (err) {
      logger.error({ err, userId }, "Failed to send announcement digest");
    }
  }

  return { sent };
}

// ─── Morning Reminder (digest — one email per user, all wines opening today) ──

export async function sendMorningAlerts(): Promise<{ sent: number }> {
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  const tomorrowUTC = new Date(todayUTC);
  tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);

  const rows = await db
    .select({
      alert: alertsTable,
      wine: winesTable,
      cycle: releaseCyclesTable,
      profile: profilesTable,
    })
    .from(alertsTable)
    .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
    .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
    .innerJoin(profilesTable, eq(alertsTable.user_id, profilesTable.id))
    .where(
      and(
        eq(alertsTable.morning_alert_sent, false),
        isNotNull(releaseCyclesTable.release_opens_at),
        gte(releaseCyclesTable.release_opens_at, todayUTC),
        lt(releaseCyclesTable.release_opens_at, tomorrowUTC),
      ),
    );

  if (rows.length === 0) return { sent: 0 };

  // Group by user_id
  const byUser = new Map<string, typeof rows>();
  for (const row of rows) {
    const uid = row.alert.user_id;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(row);
  }

  const resend = getResendClient();
  let sent = 0;

  for (const [userId, userRows] of byUser) {
    const profile = userRows[0].profile;
    if (!profile?.email) continue;

    const alertIds = userRows.map((r) => r.alert.id);

    // Mark unsubscribed users done without sending
    if (profile.alerts_enabled === false) {
      await db
        .update(alertsTable)
        .set({ morning_alert_sent: true, morning_sent_at: new Date() })
        .where(inArray(alertsTable.id, alertIds));
      continue;
    }

    // Deduplicate by wine_id
    const seenWineIds = new Set<number>();
    const uniqueRows = userRows.filter((r) => {
      if (seenWineIds.has(r.wine.id)) return false;
      seenWineIds.add(r.wine.id);
      return true;
    });

    // Sort: newest program first, then wine insertion order
    uniqueRows.sort((a, b) => {
      const pa = parseInt(a.cycle.program_id ?? "0");
      const pb = parseInt(b.cycle.program_id ?? "0");
      if (pb !== pa) return pb - pa;
      return a.wine.id - b.wine.id;
    });

    let unsubToken = profile.unsubscribe_token;
    if (!unsubToken) unsubToken = await ensureUnsubscribeToken(profile.id);

    const wines: WineEntry[] = uniqueRows.map((r) => ({
      id: r.wine.id,
      wine_name: r.wine.wine_name,
      producer: r.wine.producer,
      region: r.wine.region,
      vintage: r.wine.vintage,
      score: r.wine.score,
      price: r.wine.price,
      qty_available: r.wine.qty_available,
      closing_date: r.wine.closing_date,
      buy_url: r.wine.buy_url,
      program_label: r.cycle?.program_label ?? null,
      release_opens_at: r.cycle?.release_opens_at ?? null,
    }));

    const subject =
      wines.length === 1
        ? `${wines[0].wine_name} opens for ordering today at 8:30am ET`
        : `${wines.length} watchlist wines open for ordering today at 8:30am ET`;

    try {
      await resend.emails.send({
        from: FROM_ALERTS,
        to: profile.email,
        subject,
        html: buildMorningDigestHtml(wines, unsubToken),
      });

      await db
        .update(alertsTable)
        .set({ morning_alert_sent: true, morning_sent_at: new Date() })
        .where(inArray(alertsTable.id, alertIds));

      sent++;
      logger.info({ userId, wines: wines.length, email: profile.email }, "Morning digest sent");
    } catch (err) {
      logger.error({ err, userId }, "Failed to send morning digest");
    }
  }

  return { sent };
}

// ─── Test Mode Alerts (send queued is_test alerts to admin as digest) ─────────

export async function sendTestModeAlerts(): Promise<{ sent: number; adminEmail: string | null }> {
  const [admin] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.is_admin, true))
    .limit(1);

  if (!admin?.email) return { sent: 0, adminEmail: null };

  const pending = await db
    .select({
      alert: alertsTable,
      wine: winesTable,
      cycle: releaseCyclesTable,
    })
    .from(alertsTable)
    .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
    .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, true)));

  if (pending.length === 0) return { sent: 0, adminEmail: admin.email };

  // Deduplicate by wine_id
  const seenWineIds = new Set<number>();
  const uniqueRows = pending.filter((r) => {
    if (seenWineIds.has(r.wine.id)) return false;
    seenWineIds.add(r.wine.id);
    return true;
  });

  uniqueRows.sort((a, b) => {
    const pa = parseInt(a.cycle.program_id ?? "0");
    const pb = parseInt(b.cycle.program_id ?? "0");
    if (pb !== pa) return pb - pa;
    return a.wine.id - b.wine.id;
  });

  const wines: WineEntry[] = uniqueRows.map((r) => ({
    id: r.wine.id,
    wine_name: r.wine.wine_name,
    producer: r.wine.producer,
    region: r.wine.region,
    vintage: r.wine.vintage,
    score: r.wine.score,
    price: r.wine.price,
    qty_available: r.wine.qty_available,
    closing_date: r.wine.closing_date,
    buy_url: r.wine.buy_url,
    program_label: r.cycle?.program_label ?? null,
    release_opens_at: r.cycle?.release_opens_at ?? null,
  }));

  const resend = getResendClient();
  const subject =
    wines.length === 1
      ? `[TEST] ${wines[0].wine_name} announced — your watchlist match`
      : `[TEST] ${wines.length} watchlist matches announced on Vintages`;

  try {
    await resend.emails.send({
      from: FROM_ALERTS,
      to: admin.email,
      subject,
      html: buildAnnouncementDigestHtml(wines, null),
    });

    const alertIds = pending.map((r) => r.alert.id);
    await db
      .update(alertsTable)
      .set({ sent: true, sent_at: new Date(), announcement_alert_sent: true })
      .where(inArray(alertsTable.id, alertIds));

    logger.info({ adminEmail: admin.email, wines: wines.length }, "Test mode digest sent to admin");
    return { sent: 1, adminEmail: admin.email };
  } catch (err) {
    logger.error({ err }, "Failed to send test mode digest");
    return { sent: 0, adminEmail: admin.email };
  }
}

// ─── Pending alert counts ─────────────────────────────────────────────────────

export async function getPendingAlertCounts(): Promise<{
  real: number;
  test: number;
  realUsers: number;
}> {
  const [realCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  const [testCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, true)));

  const realUsersRows = await db
    .selectDistinct({ user_id: alertsTable.user_id })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  return {
    real: Number(realCount?.count ?? 0),
    test: Number(testCount?.count ?? 0),
    realUsers: realUsersRows.length,
  };
}

// ─── Test alert (sends demo emails to a specific address) ────────────────────

export async function sendTestAlert(toEmail: string): Promise<{ sent: number; responses: unknown[] }> {
  const resend = getResendClient();

  // Announcement demo: preview wine (release_opens_at in the future → STATUS: Preview row)
  const announcementWine: WineEntry = {
    id: 0,
    wine_name: "Château Lafite Rothschild Pauillac 1995",
    producer: "Château Lafite Rothschild",
    region: "Bordeaux",
    vintage: "1995",
    score: "98",
    price: "2475.00",
    qty_available: null,
    closing_date: null,
    buy_url: "https://www.vintagesshoponline.com",
    program_label: "Lafite / William Fèvre (May26) Post Event Offer",
    release_opens_at: new Date("2026-06-11T12:30:00Z"), // next Thursday 8:30am ET
  };

  // Morning reminder demo: wine available today (no release_opens_at → CLOSES row)
  const morningWine: WineEntry = {
    id: 0,
    wine_name: "Château Lafite Rothschild Pauillac 1995",
    producer: "Château Lafite Rothschild",
    region: "Bordeaux",
    vintage: "1995",
    score: "98",
    price: "2475.00",
    qty_available: null,
    closing_date: "July 10, 2026",
    buy_url: "https://www.vintagesshoponline.com",
    program_label: "Lafite / William Fèvre (May26) Post Event Offer",
    release_opens_at: null,
  };

  const responses: unknown[] = [];

  logger.info({ to: toEmail, from: FROM_ALERTS }, "Sending test announcement digest");
  const r1 = await resend.emails.send({
    from: FROM_ALERTS,
    to: toEmail,
    subject: `${announcementWine.wine_name} announced — your watchlist match`,
    html: buildAnnouncementDigestHtml([announcementWine]),
  });
  logger.info({ resendResponse: r1 }, "Test announcement email Resend response");
  responses.push(r1);

  logger.info({ to: toEmail, from: FROM_ALERTS }, "Sending test morning digest");
  const r2 = await resend.emails.send({
    from: FROM_ALERTS,
    to: toEmail,
    subject: `${morningWine.wine_name} opens for ordering today at 8:30am ET`,
    html: buildMorningDigestHtml([morningWine]),
  });
  logger.info({ resendResponse: r2 }, "Test morning email Resend response");
  responses.push(r2);

  const sent = responses.filter((r: any) => r?.data?.id && !r?.error).length;
  return { sent, responses };
}

// ─── Password Reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(toEmail: string, resetToken: string): Promise<void> {
  const resend = getResendClient();
  const resetUrl = `${BASE_URL}/reset-password?token=${resetToken}`;

  const inner = `
    <h1 style="color:#F2EBD9;font-size:24px;line-height:1.3;margin:0 0 12px;font-family:Georgia,serif;">Reset your password</h1>
    <p style="color:#F2EBD9;opacity:0.75;font-size:14px;font-family:sans-serif;line-height:1.7;margin:0 0 32px;">
      We received a request to reset the password for your Thursday Drop account.<br>
      Click the button below to choose a new password. This link expires in <strong style="color:#B8860B;">1 hour</strong>.
    </p>
    <a href="${resetUrl}" style="display:inline-block;background:#B8860B;color:#1a040a;padding:14px 32px;text-decoration:none;font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:32px;">Reset Password →</a>
    <p style="color:#F2EBD9;opacity:0.4;font-size:12px;font-family:sans-serif;line-height:1.6;margin:0;">
      If you didn't request a password reset, you can safely ignore this email.<br>
      Your password will not change.
    </p>
  `;

  await resend.emails.send({
    from: FROM_ALERTS,
    to: toEmail,
    subject: "Reset your Thursday Drop password",
    html: emailWrapper(inner),
  });

  logger.info({ to: toEmail }, "Password reset email sent");
}

// ─── Weekly Picks ─────────────────────────────────────────────────────────────

export async function sendWeeklyPicks(subject: string, body: string): Promise<{ sent: number }> {
  const proProfiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.is_pro, true));

  if (proProfiles.length === 0) return { sent: 0 };

  const resend = getResendClient();
  let sent = 0;

  for (const profile of proProfiles) {
    if (!profile.email) continue;
    if (profile.alerts_enabled === false) continue;

    let unsubToken = profile.unsubscribe_token;
    if (!unsubToken) {
      unsubToken = await ensureUnsubscribeToken(profile.id);
    }

    try {
      await resend.emails.send({
        from: FROM_PICKS,
        to: profile.email,
        subject,
        html: emailWrapper(`
          <h1 style="color:#B8860B;font-size:20px;margin:0 0 24px;font-family:Georgia,serif;">Weekly Picks</h1>
          <div style="line-height:1.8;font-size:14px;font-family:Georgia,serif;white-space:pre-wrap;">${body}</div>
        `, unsubToken),
      });
      sent++;
    } catch (err) {
      logger.error({ err, userId: profile.id }, "Failed to send weekly picks email");
    }
  }

  return { sent };
}
