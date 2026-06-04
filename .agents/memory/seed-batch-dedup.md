---
name: Seed script batch deduplication
description: PostgreSQL rejects ON CONFLICT DO UPDATE when the same unique-constrained row appears twice in one batch INSERT statement.
---

**Rule:** Before batching rows for `INSERT ... ON CONFLICT DO UPDATE`, deduplicate by the unique constraint key within each batch. PostgreSQL error code 21000 — "ON CONFLICT DO UPDATE command cannot affect row a second time."

**Why:** The `wine_suggestions` seed script generates both wine entries and producer entries from the same wines table. A single scraped wine can produce two rows with the same `(display_name, type)` pair (e.g., duplicate wine names across release cycles). When batched into one INSERT, PostgreSQL rejects the statement even though it would succeed row-by-row.

**How to apply:** Use a `Map<string, row>` keyed by `${display_name.toLowerCase()}::${type}` to deduplicate before splitting into batches of size N. This applies to any seed script using `onConflictDoUpdate` with a composite unique key.
