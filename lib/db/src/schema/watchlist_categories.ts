import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const watchlistCategoriesTable = pgTable("watchlist_categories", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  category: text("category").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type WatchlistCategory = typeof watchlistCategoriesTable.$inferSelect;
