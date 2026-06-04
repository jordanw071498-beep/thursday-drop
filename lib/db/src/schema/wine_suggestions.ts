import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wineSuggestionsTable = pgTable("wine_suggestions", {
  id: serial("id").primaryKey(),
  display_name: text("display_name").notNull(),
  normalized_name: text("normalized_name").notNull(),
  producer: text("producer"),
  wine_name: text("wine_name"),
  type: text("type").notNull(), // 'producer' | 'wine'
  source: text("source").notNull(), // 'scraped' | 'watchlist' | 'curated'
  count: integer("count").notNull().default(1),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("wine_suggestions_normalized_idx").on(t.normalized_name),
  uniqueIndex("wine_suggestions_display_type_idx").on(t.display_name, t.type),
]);

export const insertWineSuggestionSchema = createInsertSchema(wineSuggestionsTable).omit({ id: true, created_at: true });
export type InsertWineSuggestion = z.infer<typeof insertWineSuggestionSchema>;
export type WineSuggestion = typeof wineSuggestionsTable.$inferSelect;
