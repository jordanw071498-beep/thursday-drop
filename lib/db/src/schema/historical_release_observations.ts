import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const historicalReleaseObservationsTable = pgTable(
  "historical_release_observations",
  {
    id: serial("id").primaryKey(),

    wine_name:   text("wine_name").notNull(),
    wine_key:    text("wine_key").notNull(),
    producer:    text("producer"),
    vintage:     text("vintage"),
    bottle_size: text("bottle_size"),
    lcbo_number: text("lcbo_number"),

    price:        numeric("price",  { precision: 10, scale: 2 }),
    score:        numeric("score",  { precision: 5,  scale: 1 }),
    score_source: text("score_source"),

    program_id:      text("program_id").notNull(),
    program_type:    text("program_type").notNull(),
    program_label:   text("program_label"),
    release_opens_at: text("release_opens_at"),
    release_month:   text("release_month"),
    closing_date:    text("closing_date"),

    first_seen_at: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source_url:    text("source_url"),
    confidence:    text("confidence").notNull().default("high"),
    source_method: text("source_method").notNull().default("live_scrape"),
  },
  (table) => [
    uniqueIndex("hro_wine_program_uniq").on(
      table.wine_key,
      sql`COALESCE(${table.vintage}, '')`,
      sql`COALESCE(${table.bottle_size}, '')`,
      table.program_id,
    ),
  ],
);

export type HistoricalReleaseObservation =
  typeof historicalReleaseObservationsTable.$inferSelect;
export type InsertHistoricalReleaseObservation =
  typeof historicalReleaseObservationsTable.$inferInsert;
