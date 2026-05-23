import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistItemsTable = pgTable("watchlist_items", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  wine_name: text("wine_name").notNull(),
  vintage: text("vintage"),
  producer: text("producer"),
  region: text("region"),
  match_type: text("match_type").notNull().default("exact"),
  match_threshold: numeric("match_threshold", { precision: 5, scale: 1 }),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertWatchlistItemSchema = createInsertSchema(watchlistItemsTable).omit({ id: true, created_at: true });
export type InsertWatchlistItem = z.infer<typeof insertWatchlistItemSchema>;
export type WatchlistItem = typeof watchlistItemsTable.$inferSelect;
