import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  wine_id: integer("wine_id").notNull(),
  wine_name: text("wine_name").notNull(),
  // Legacy / announcement alert tracking
  sent: boolean("sent").notNull().default(false),
  sent_at: timestamp("sent_at"),
  // Explicit two-alert tracking
  announcement_alert_sent: boolean("announcement_alert_sent").notNull().default(false),
  morning_alert_sent: boolean("morning_alert_sent").notNull().default(false),
  morning_sent_at: timestamp("morning_sent_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, created_at: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
