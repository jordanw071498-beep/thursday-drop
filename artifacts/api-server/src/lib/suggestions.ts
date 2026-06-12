import { db, wineSuggestionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export type SuggestionInput = {
  display_name: string;
  producer: string | null;
  wine_name: string | null;
  type: "wine" | "producer";
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const BATCH_SIZE = 50;

/**
 * Upsert one or more wine/producer suggestions.
 * Safe to call fire-and-forget — deduplicates within the batch so a single
 * INSERT … ON CONFLICT DO UPDATE never touches the same row twice.
 * Existing rows get their `count` incremented (popularity signal).
 */
export async function upsertSuggestions(
  items: SuggestionInput[],
  source: string,
): Promise<void> {
  if (items.length === 0) return;

  // Deduplicate within the batch — PostgreSQL rejects ON CONFLICT DO UPDATE
  // when the same unique-constrained row appears twice in one statement.
  const seen = new Map<string, {
    display_name: string;
    normalized_name: string;
    producer: string | null;
    wine_name: string | null;
    type: string;
    source: string;
    count: number;
  }>();

  for (const item of items) {
    const name = item.display_name.trim();
    if (!name) continue;
    const key = `${normalize(name)}::${item.type}`;
    if (!seen.has(key)) {
      seen.set(key, {
        display_name: name,
        normalized_name: normalize(name),
        producer: item.producer ?? null,
        wine_name: item.wine_name ?? null,
        type: item.type,
        source,
        count: 1,
      });
    }
  }

  const values = [...seen.values()];

  // Auto-generate producer records for any wine entries that name a producer.
  // This ensures that typing a producer name always yields a producer suggestion
  // even if only wine records were imported for that producer.
  const autoProducers = new Map<string, {
    display_name: string;
    normalized_name: string;
    producer: string | null;
    wine_name: string | null;
    type: string;
    source: string;
    count: number;
  }>();
  for (const v of values) {
    if (v.type === "wine" && v.producer) {
      const key = `${normalize(v.producer)}::producer`;
      if (!seen.has(key) && !autoProducers.has(key)) {
        autoProducers.set(key, {
          display_name: v.producer,
          normalized_name: normalize(v.producer),
          producer: v.producer,
          wine_name: null,
          type: "producer",
          source,
          count: 1,
        });
      }
    }
  }

  const allValues = [...values, ...autoProducers.values()];

  for (let i = 0; i < allValues.length; i += BATCH_SIZE) {
    const batch = allValues.slice(i, i + BATCH_SIZE);
    await db
      .insert(wineSuggestionsTable)
      .values(batch)
      .onConflictDoUpdate({
        target: [wineSuggestionsTable.display_name, wineSuggestionsTable.type],
        set: { count: sql`${wineSuggestionsTable.count} + 1` },
      });
  }
}

/** Convenience wrapper for a single suggestion. */
export async function upsertSuggestion(
  item: SuggestionInput,
  source: string,
): Promise<void> {
  return upsertSuggestions([item], source);
}
