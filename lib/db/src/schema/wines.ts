import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releaseCyclesTable } from "./release_cycles";

export const winesTable = pgTable("wines", {
  id: serial("id").primaryKey(),
  release_cycle_id: integer("release_cycle_id").notNull().references(() => releaseCyclesTable.id),
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
  qty_available: integer("qty_available"),
  closing_date: text("closing_date"),
  buy_url: text("buy_url"),
  sold_out: boolean("sold_out").notNull().default(false),
});

export const insertWineSchema = createInsertSchema(winesTable).omit({ id: true });
export type InsertWine = z.infer<typeof insertWineSchema>;
export type Wine = typeof winesTable.$inferSelect;
