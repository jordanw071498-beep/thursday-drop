import { Resend } from "resend";
import { eq, and, gte, lt, isNotNull } from "drizzle-orm";
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
      <td style="padding:8px 0;color:#F2EBD9;opacity:0.6;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;width:38%;font-family:sans-serif;">${label}</td>
      <td style="padding:8px 0;color:${valueColor};font-size:14px;font-family:Georgia,serif;">${value}</td>
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

// ─── Announcement Alert ───────────────────────────────────────────────────────

function programBadge(label: string | null | undefined): string {
  if (!label) return "";
  return `<p style="display:inline-block;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#1a040a;background:#B8860B;padding:3px 10px;margin:0 0 20px;">${label}</p>`;
}

function buildAnnouncementHtml(
  wine: {
    wine_name: string;
    producer: string | null;
    region: string | null;
    vintage: string | null;
    score: unknown;
    price: unknown;
    qty_available: number | null;
    closing_date: string | null;
    buy_url: string | null;
    program_label?: string | null;
  },
  releaseOpensAt: Date | null,
  unsubscribeToken?: string | null,
): string {
  const buyUrl =
    wine.buy_url ?? `https://www.lcbo.com/en/search?q=${encodeURIComponent(wine.wine_name)}`;
  const releaseDate = formatReleaseDate(releaseOpensAt);

  const inner = `
    ${programBadge(wine.program_label)}
    <h1 style="color:#F2EBD9;font-size:22px;line-height:1.35;margin:0 0 8px;font-family:Georgia,serif;">${wine.wine_name}</h1>
    ${wine.producer ? `<p style="color:#B8860B;font-size:13px;margin:0 0 28px;font-family:sans-serif;">${wine.producer}</p>` : `<div style="margin-bottom:28px;"></div>`}

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
      ${tableRow("Vintage", wine.vintage)}
      ${tableRow("Region", wine.region)}
      ${tableRow("Score", wine.score ? `${wine.score} pts` : null, "#B8860B")}
      ${tableRow("Price", wine.price ? `$${wine.price}` : null)}
      ${tableRow("Qty available", wine.qty_available ? `${wine.qty_available} bottles` : null)}
      ${tableRow("Closes", wine.closing_date)}
    </table>

    <div style="border-left:3px solid #B8860B;padding:12px 16px;background:rgba(184,134,11,0.08);margin-bottom:32px;">
      <p style="font-family:sans-serif;font-size:13px;color:#F2EBD9;margin:0;line-height:1.5;">
        Ordering opens <strong style="color:#B8860B;">${releaseDate} at 8:30am Eastern</strong> — be ready.
      </p>
    </div>

    <a href="${buyUrl}" style="display:inline-block;background:#B8860B;color:#1a040a;padding:14px 28px;text-decoration:none;font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">View on LCBO Vintages →</a>
  `;

  return emailWrapper(inner, unsubscribeToken);
}

async function ensureUnsubscribeToken(profileId: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .update(profilesTable)
    .set({ unsubscribe_token: token })
    .where(eq(profilesTable.id, profileId));
  return token;
}

export async function sendPendingAlerts(): Promise<{ sent: number }> {
  const pending = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.announcement_alert_sent, false));

  if (pending.length === 0) return { sent: 0 };

  const resend = getResendClient();
  let sent = 0;

  for (const alert of pending) {
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, alert.user_id))
      .limit(1);

    if (!profile?.email) continue;

    // Skip users who have unsubscribed — mark both flags so we never retry
    if (profile.alerts_enabled === false) {
      await db
        .update(alertsTable)
        .set({ sent: true, sent_at: new Date(), announcement_alert_sent: true })
        .where(eq(alertsTable.id, alert.id));
      continue;
    }

    const [wine] = await db
      .select()
      .from(winesTable)
      .where(eq(winesTable.id, alert.wine_id))
      .limit(1);

    if (!wine) continue;

    const [cycle] = await db
      .select()
      .from(releaseCyclesTable)
      .where(eq(releaseCyclesTable.id, wine.release_cycle_id))
      .limit(1);

    // Ensure unsubscribe token exists for this user
    let unsubToken = profile.unsubscribe_token;
    if (!unsubToken) {
      unsubToken = await ensureUnsubscribeToken(profile.id);
    }

    try {
      await resend.emails.send({
        from: FROM_ALERTS,
        to: profile.email,
        subject: `${wine.wine_name} just appeared on Vintages`,
        html: buildAnnouncementHtml(
          { ...wine, program_label: cycle?.program_label ?? null },
          cycle?.release_opens_at ?? null,
          unsubToken,
        ),
      });

      await db
        .update(alertsTable)
        .set({
          sent: true,
          sent_at: new Date(),
          announcement_alert_sent: true,
        })
        .where(eq(alertsTable.id, alert.id));

      sent++;
      logger.info({ alertId: alert.id, email: profile.email }, "Announcement alert sent");
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "Failed to send announcement alert");
    }
  }

  return { sent };
}

// ─── Morning Alert ────────────────────────────────────────────────────────────

function buildMorningHtml(wine: {
  wine_name: string;
  producer: string | null;
  region: string | null;
  score: unknown;
  price: unknown;
  qty_available: number | null;
  buy_url: string | null;
  program_label?: string | null;
}, unsubscribeToken?: string | null): string {
  const buyUrl =
    wine.buy_url ?? `https://www.lcbo.com/en/search?q=${encodeURIComponent(wine.wine_name)}`;

  const inner = `
    <p style="color:#B8860B;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-family:sans-serif;margin:0 0 16px;">90-Minute Reminder</p>
    ${programBadge(wine.program_label)}
    <h1 style="color:#F2EBD9;font-size:22px;line-height:1.35;margin:0 0 8px;font-family:Georgia,serif;">${wine.wine_name}</h1>
    ${wine.producer ? `<p style="color:#B8860B;font-size:13px;margin:0 0 28px;font-family:sans-serif;">${wine.producer}</p>` : `<div style="margin-bottom:28px;"></div>`}

    <div style="border:1px solid rgba(184,134,11,0.4);padding:20px 24px;margin-bottom:32px;background:rgba(184,134,11,0.06);">
      <p style="font-family:sans-serif;font-size:15px;color:#B8860B;font-weight:700;margin:0 0 4px;">Opens for ordering at 8:30am Eastern this morning.</p>
      <p style="font-family:sans-serif;font-size:13px;color:#F2EBD9;opacity:0.7;margin:0;">Quantities are limited — have your LCBO account ready.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
      ${tableRow("Region", wine.region)}
      ${tableRow("Score", wine.score ? `${wine.score} pts` : null, "#B8860B")}
      ${tableRow("Price", wine.price ? `$${wine.price}` : null)}
      ${tableRow("Qty available", wine.qty_available ? `${wine.qty_available} bottles` : null)}
    </table>

    <a href="${buyUrl}" style="display:inline-block;background:#B8860B;color:#1a040a;padding:14px 28px;text-decoration:none;font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Order Now on LCBO Vintages →</a>
  `;

  return emailWrapper(inner, unsubscribeToken);
}

export async function sendMorningAlerts(): Promise<{ sent: number }> {
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  const tomorrowUTC = new Date(todayUTC);
  tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);

  const due = await db
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

  if (due.length === 0) return { sent: 0 };

  const resend = getResendClient();
  let sent = 0;

  for (const row of due) {
    const { alert, wine, profile } = row;
    if (!profile?.email) continue;
    // Skip unsubscribed users — mark the flag so we never retry
    if (profile.alerts_enabled === false) {
      await db
        .update(alertsTable)
        .set({ morning_alert_sent: true, morning_sent_at: new Date() })
        .where(eq(alertsTable.id, alert.id));
      continue;
    }

    let unsubToken = profile.unsubscribe_token;
    if (!unsubToken) {
      unsubToken = await ensureUnsubscribeToken(profile.id);
    }

    try {
      await resend.emails.send({
        from: FROM_ALERTS,
        to: profile.email,
        subject: `${wine.wine_name} opens for ordering in 90 minutes — act fast`,
        html: buildMorningHtml(
          { ...wine, program_label: row.cycle?.program_label ?? null },
          unsubToken,
        ),
      });

      await db
        .update(alertsTable)
        .set({ morning_alert_sent: true, morning_sent_at: new Date() })
        .where(eq(alertsTable.id, alert.id));

      sent++;
      logger.info({ alertId: alert.id, email: profile.email }, "Morning alert sent");
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "Failed to send morning alert");
    }
  }

  return { sent };
}

// ─── Test alert ───────────────────────────────────────────────────────────────

export async function sendTestAlert(toEmail: string): Promise<{ sent: number; responses: unknown[] }> {
  const resend = getResendClient();
  const demoWine = {
    wine_name: "Château Margaux 2018",
    producer: "Château Margaux",
    region: "Bordeaux, France",
    vintage: "2018",
    score: "100",
    price: "1495.00",
    qty_available: 24,
    closing_date: "June 5, 2026",
    buy_url: "https://www.vintagesshoponline.com",
    program_label: "Cellar Collection: Monthly Features",
  };
  const demoOpensAt = new Date();
  demoOpensAt.setUTCHours(13, 30, 0, 0);

  const responses: unknown[] = [];

  logger.info({ to: toEmail, from: FROM_ALERTS }, "Sending test announcement email");
  const r1 = await resend.emails.send({
    from: FROM_ALERTS,
    to: toEmail,
    subject: `[TEST] ${demoWine.wine_name} just appeared on Vintages`,
    html: buildAnnouncementHtml(demoWine, demoOpensAt),
  });
  logger.info({ resendResponse: r1 }, "Test announcement email Resend response");
  responses.push(r1);

  logger.info({ to: toEmail, from: FROM_ALERTS }, "Sending test morning email");
  const r2 = await resend.emails.send({
    from: FROM_ALERTS,
    to: toEmail,
    subject: `[TEST] ${demoWine.wine_name} opens for ordering in 90 minutes — act fast`,
    html: buildMorningHtml(demoWine),
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
