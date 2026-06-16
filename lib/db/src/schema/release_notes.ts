import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const releaseNotesTable = pgTable(
  "release_notes",
  {
    id:                   serial("id").primaryKey(),
    slug:                 text("slug").notNull().unique(),
    title:                text("title").notNull(),
    body:                 text("body").notNull(),
    excerpt:              text("excerpt"),
    hero_image_url:       text("hero_image_url"),
    author:               text("author").notNull().default("Thursday Drop"),
    article_type:         text("article_type").notNull().default("weekly_release"),
    status:               text("status").notNull().default("draft"),
    published_at:         timestamp("published_at", { withTimezone: true }),
    reading_time_minutes: integer("reading_time_minutes"),
    view_count:           integer("view_count").notNull().default(0),
    featured_wines:       jsonb("featured_wines").notNull().default([]),
    created_at:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("release_notes_status_published_at_idx").on(table.status, table.published_at),
  ],
);

export type ReleaseNote = typeof releaseNotesTable.$inferSelect;
export type InsertReleaseNote = typeof releaseNotesTable.$inferInsert;
