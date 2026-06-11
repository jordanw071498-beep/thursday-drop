---
name: Matching engine unicode normalization
description: Accent/diacritic normalization added to watchlist matching to handle LCBO vs user input encoding differences.
---

## The issue
Watchlist items with accented characters (Álvaro, Romanée, Prieuré) would fail to match LCBO wines if LCBO stored them without accents (or vice versa). JavaScript toLowerCase() does NOT strip diacritics.

## Fix
Added normalizeForMatch(s) in scraper.ts before the CATEGORY_MATCHERS block:

```ts
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")               // decompose é → e + combining accent
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritic marks
    .toLowerCase();
}
```

Applied to both runMatchingEngine() and queueAlertsForNewWatchlistItem().

## DB fixes applied for Patrick (first paid subscriber)
- Item 83: J-F Coche-Dury → Coche-Dury (works bidirectionally with J.-F. Coche-Dury, Jean-François Coche-Dury)
- Item 88: Masseto producer match → wine match_type (Masseto is the wine name, not LCBO producer)
- Item 93: Fattoria Le → Fattoria Le Pupille (was truncated)

**Why:** LCBO HTML source may use composed or decomposed unicode; user browser input may differ. NFD normalization makes both sides comparable regardless of encoding.
