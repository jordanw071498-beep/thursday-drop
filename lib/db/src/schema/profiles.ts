import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  password_hash: text("password_hash"),
  session_token: text("session_token"),
  is_pro: boolean("is_pro").notNull().default(false),
  is_admin: boolean("is_admin").notNull().default(false),
  stripe_customer_id: text("stripe_customer_id"),
  alerts_enabled: boolean("alerts_enabled").notNull().default(true),
  unsubscribe_token: text("unsubscribe_token"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ created_at: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
