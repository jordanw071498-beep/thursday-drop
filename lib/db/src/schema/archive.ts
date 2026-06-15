import { pgTable, serial, text, integer, numeric, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";

export const archiveReleaseCyclesTable = pgTable("archive_release_cycles", {
  id: serial("id").primaryKey(),
  program_id: text("program_id").notNull(),
  program_label: text("program_label").notNull(),
  program_type: text("program_type").notNull(),
  release_month: text("release_month"),
  release_date_inferred: boolean("release_date_inferred").notNull().default(false),
  closing_date: text("closing_date"),
  source_url: text("source_url").notNull(),
  imported_at: timestamp("imported_at").notNull().defaultNow(),
  confidence: text("confidence").notNull().default("high"),
}, (table) => [
  unique("archive_release_cycles_program_id_unique").on(table.program_id),
]);

export const archiveWinesTable = pgTable("archive_wines", {
  id: serial("id").primaryKey(),
  archive_cycle_id: integer("archive_cycle_id").notNull().references(() => archiveReleaseCyclesTable.id),
  wine_name: text("wine_name").notNull(),
  wine_key: text("wine_key"),
  producer: text("producer"),
  lcbo_number: text("lcbo_number"),
  region: text("region"),
  region_category: text("region_category"),
  vintage: text("vintage"),
  score: numeric("score", { precision: 5, scale: 1 }),
  score_source: text("score_source"),
  price: numeric("price", { precision: 10, scale: 2 }),
  bottle_size: text("bottle_size"),
  source_url: text("source_url"),
  imported_at: timestamp("imported_at").notNull().defaultNow(),
}, (table) => [
  index("archive_wines_wine_key_idx").on(table.wine_key),
  index("archive_wines_producer_idx").on(table.producer),
  index("archive_wines_wine_key_vintage_idx").on(table.wine_key, table.vintage),
]);

export type ArchiveReleaseCycle = typeof archiveReleaseCyclesTable.$inferSelect;
export type InsertArchiveReleaseCycle = typeof archiveReleaseCyclesTable.$inferInsert;
export type ArchiveWine = typeof archiveWinesTable.$inferSelect;
export type InsertArchiveWine = typeof archiveWinesTable.$inferInsert;
