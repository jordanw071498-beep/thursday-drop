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

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
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
