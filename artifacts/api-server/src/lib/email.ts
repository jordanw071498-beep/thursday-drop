import { Resend } from "resend";
import { eq, and } from "drizzle-orm";
import { db, alertsTable, profilesTable, winesTable, emailSubscribersTable } from "@workspace/db";
import { logger } from "./logger";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  return new Resend(apiKey);
}

export async function sendPendingAlerts(): Promise<{ sent: number }> {
  const pending = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.sent, false));

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

    const [wine] = await db
      .select()
      .from(winesTable)
      .where(eq(winesTable.id, alert.wine_id))
      .limit(1);

    if (!wine) continue;

    const buyUrl = wine.buy_url ?? `https://www.lcbo.com/en/search?q=${encodeURIComponent(wine.wine_name)}`;

    try {
      await resend.emails.send({
        from: "Thursday Drop <alerts@thursdaydrop.ca>",
        to: profile.email,
        subject: `Watchlist Match: ${wine.wine_name}`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #1a040a; color: #F2EBD9; padding: 40px;">
            <h1 style="color: #B8860B; font-size: 24px; margin-bottom: 8px;">Thursday Drop</h1>
            <p style="color: #F2EBD9; opacity: 0.7; font-size: 14px; margin-bottom: 32px;">Watchlist Alert</p>
            <h2 style="color: #F2EBD9; font-size: 20px;">${wine.wine_name}</h2>
            ${wine.producer ? `<p style="color: #B8860B;">${wine.producer}</p>` : ""}
            <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
              ${wine.region ? `<tr><td style="padding: 8px 0; color: #F2EBD9; opacity: 0.7; width: 40%;">Region</td><td style="color: #F2EBD9;">${wine.region}</td></tr>` : ""}
              ${wine.score ? `<tr><td style="padding: 8px 0; color: #F2EBD9; opacity: 0.7;">Score</td><td style="color: #B8860B; font-weight: bold;">${wine.score} pts</td></tr>` : ""}
              ${wine.price ? `<tr><td style="padding: 8px 0; color: #F2EBD9; opacity: 0.7;">Price</td><td style="color: #F2EBD9;">$${wine.price}</td></tr>` : ""}
              ${wine.qty_available ? `<tr><td style="padding: 8px 0; color: #F2EBD9; opacity: 0.7;">Available</td><td style="color: #F2EBD9;">${wine.qty_available} bottles</td></tr>` : ""}
            </table>
            <a href="${buyUrl}" style="display: inline-block; background: #B8860B; color: #1a040a; padding: 14px 28px; text-decoration: none; font-family: sans-serif; font-weight: 600; letter-spacing: 0.05em;">BUY AT LCBO</a>
          </div>
        `,
      });

      await db
        .update(alertsTable)
        .set({ sent: true, sent_at: new Date() })
        .where(eq(alertsTable.id, alert.id));

      sent++;
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "Failed to send alert email");
    }
  }

  return { sent };
}

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
    try {
      await resend.emails.send({
        from: "Thursday Drop <picks@thursdaydrop.ca>",
        to: profile.email,
        subject,
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #1a040a; color: #F2EBD9; padding: 40px;">
            <h1 style="color: #B8860B; font-size: 24px; margin-bottom: 8px;">Thursday Drop</h1>
            <p style="color: #F2EBD9; opacity: 0.7; font-size: 14px; margin-bottom: 32px;">Weekly Picks — Pro Edition</p>
            <div style="line-height: 1.7; white-space: pre-wrap;">${body}</div>
          </div>
        `,
      });
      sent++;
    } catch (err) {
      logger.error({ err, userId: profile.id }, "Failed to send weekly picks email");
    }
  }

  return { sent };
}
