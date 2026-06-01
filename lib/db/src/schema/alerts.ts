import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  wine_id: integer("wine_id").notNull(),
  wine_name: text("wine_name").notNull(),
  // Announcement alert (Thursday early notification)
  sent: boolean("sent").notNull().default(false),
  sent_at: timestamp("sent_at"),
  announcement_alert_sent: boolean("announcement_alert_sent").notNull().default(false),
  // Morning reminder (release-day notification)
  morning_alert_sent: boolean("morning_alert_sent").notNull().default(false),
  morning_sent_at: timestamp("morning_sent_at"),
  // Test mode — alerts created while Test Mode is ON; never sent to real users
  is_test: boolean("is_test").notNull().default(false),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // One alert row per user per wine — prevents duplicate emails when multiple
  // watchlist items match the same wine, or if the scraper runs concurrently.
  userWineUnique: uniqueIndex("alerts_user_wine_idx").on(t.user_id, t.wine_id),
}));

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, created_at: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
