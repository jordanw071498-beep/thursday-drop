import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const releaseCyclesTable = pgTable("release_cycles", {
  id: serial("id").primaryKey(),
  program_id: text("program_id").notNull(),
  program_label: text("program_label").notNull(),
  program_type: text("program_type").notNull(),
  release_date: text("release_date"),
  closing_date: text("closing_date"),
  scraped_at: timestamp("scraped_at").notNull().defaultNow(),
  wine_count: integer("wine_count").notNull().default(0),
  display_order: integer("display_order").notNull().default(0),
  status: text("status").notNull().default("available"),
  // Exact datetime ordering opens — Thursday 8:30am Eastern
  release_opens_at: timestamp("release_opens_at"),
});

export const insertReleaseCycleSchema = createInsertSchema(releaseCyclesTable).omit({ id: true, scraped_at: true });
export type InsertReleaseCycle = z.infer<typeof insertReleaseCycleSchema>;
export type ReleaseCycle = typeof releaseCyclesTable.$inferSelect;
