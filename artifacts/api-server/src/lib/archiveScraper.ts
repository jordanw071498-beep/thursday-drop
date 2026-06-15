/**
 * archiveScraper.ts — Historical Vintages archive scraper.
 *
 * ISOLATION GUARANTEE:
 *   - Does NOT import from scraper.ts
 *   - Does NOT write to wines, release_cycles, alerts, watchlist_items, or profiles
 *   - Does NOT call runMatchingEngine, sendPendingAlerts, sendMorningAlerts,
 *     queueAlertsForNewWatchlistItem, or any email function
 *   - Writes ONLY to archive_release_cycles and archive_wines tables
 *
 * Data source: Wayback Machine snapshots (archive.org) of vintagesshoponline.com
 * pages captured while programs were OPEN. The live site shows "program closed"
 * for historical IDs, so Wayback snapshots are the only reliable data source.
 *
 * Pure helpers are duplicated here intentionally to avoid any coupling to the
 * live alert infrastructure.
 */

import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";
import { db, archiveReleaseCyclesTable, archiveWinesTable } from "@workspace/db";
import { logger } from "./logger.js";

const UA = "Mozilla/5.0 (compatible; ThursdayDropBot/1.0; +https://thursdaydrop.ca)";
const FETCH_DELAY_MS = 400;
const SOURCE_BASE = "https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx";
const CDX_BULK_URL =
  "http://web.archive.org/cdx/search/cdx" +
  "?url=vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx*" +
  "&output=json&fl=original,timestamp&limit=5000&filter=statuscode:200&from=20150101";

// ── Pure parsing helpers (isolated copies — do not import from scraper.ts) ──

function extractVintage(name: string): string | null {
  const m = name.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? m[0] : null;
}

function parseScore(raw: string): { score: number | null; score_source: string | null } {
  const m = raw.trim().match(/^(\d+)\s*\(([^)]+)\)$/);
  if (m) return { score: parseFloat(m[1]), score_source: m[2] };
  const n = raw.trim().match(/^(\d{2,3})$/);
  if (n) return { score: parseFloat(n[1]), score_source: null };
  return { score: null, score_source: null };
}

function categorizeRegion(region: string, countryGroup: string): string {
  const t = `${region} ${countryGroup}`.toLowerCase();
  if (/burgundy|bourgogne|chablis|c[oô]te[- ]d['']or/.test(t)) return "burgundy";
  if (/bordeaux|m[eé]doc|pauillac|saint-[eé]milion/.test(t)) return "bordeaux";
  if (/rh[oô]ne|ch[aâ]teauneuf|hermitage/.test(t)) return "rhone";
  if (/champagne/.test(t)) return "champagne";
  if (/italy|italia|tuscany|piedmont|barolo|barbaresco|brunello|chianti|amarone/.test(t)) return "italy";
  return "other";
}

function extractProducer(wineName: string): string | null {
  const noYear = wineName.replace(/\b(19[5-9]\d|20[0-3]\d)\b/g, "").trim();
  const VARIATALS_RE = /\b(Cabernet|Chardonnay|Pinot|Merlot|Syrah|Shiraz|Riesling|Sauvignon|Blanc de Blancs|Blanc de Noirs|Rouge|Brut|Nature|Ros[eé]|NV|Sec|Demi|Grand Cru|Premier Cru|Villages|Superiore|Reserva|Crianza|Cava)\b/i;
  const idx = noYear.search(VARIATALS_RE);
  const base = idx > 1 ? noYear.slice(0, idx).trim() : noYear;
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0].toLowerCase();
  if (first === "château" || first === "chateau" || first === "domaine" || first === "maison") {
    return words.slice(0, Math.min(3, words.length)).join(" ");
  }
  return words.slice(0, Math.min(2, words.length)).join(" ") || null;
}

function generateWineKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-CA,en;q=0.9",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  return resp.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Wayback Machine helpers ──────────────────────────────────────────────────

interface WaybackSnapshot {
  snapshotUrl: string;   // the archived URL (with /web/{timestamp}/)
  rawUrl: string;        // if_ version — no Wayback toolbar injected
  timestamp: string;     // YYYYMMDDHHMMSS
  originalUrl: string;   // the original URL as archived
}

/** CDX lookup table: programId → all known snapshots, sorted oldest-first */
type CdxEntry = { timestamp: string; originalUrl: string };
type CdxLookup = Map<string, CdxEntry[]>;

/**
 * Build a CDX lookup table for all archived program pages in one request.
 * Stores ALL snapshots per programId (deduplicated to one per calendar day).
 * Snapshots are sorted chronologically oldest-first.
 * The caller tries them in reverse order (latest → earliest) so that the most
 * recent open snapshot is found first.
 */
async function buildCdxLookup(): Promise<CdxLookup> {
  const resp = await fetch(CDX_BULK_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`CDX bulk query failed: HTTP ${resp.status}`);

  const rows = (await resp.json()) as [string, string][];
  const lookup: CdxLookup = new Map();

  for (const [original, timestamp] of rows.slice(1)) {
    const m = original.match(/programId=(\d+)/i);
    if (!m) continue;
    const programId = m[1];
    if (!lookup.has(programId)) lookup.set(programId, []);
    const arr = lookup.get(programId)!;
    // Deduplicate by calendar day (YYYYMMDD) — keep earliest within same day
    const day = timestamp.slice(0, 8);
    if (!arr.some((e) => e.timestamp.slice(0, 8) === day)) {
      arr.push({ timestamp, originalUrl: original });
    }
  }

  // Sort each array chronologically oldest-first
  for (const [, snapshots] of lookup) {
    snapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return lookup;
}

/** Construct WaybackSnapshot from a CDX lookup entry. */
function snapshotFromCdx(entry: CdxEntry): WaybackSnapshot {
  const { timestamp, originalUrl } = entry;
  const snapshotUrl = `https://web.archive.org/web/${timestamp}/${originalUrl}`;
  const rawUrl      = `https://web.archive.org/web/${timestamp}if_/${originalUrl}`;
  return { snapshotUrl, rawUrl, timestamp, originalUrl };
}

// ── Program metadata extraction ───────────────────────────────────────────────

/**
 * Extract program type from span.labelProgramName — the page's own content-area
 * label, not the navigation menu (which always shows all collection types).
 */
function extractProgramType($: cheerio.CheerioAPI): string {
  const labelText = $(".labelProgramName, #ctl00_ContentMain_LabelProgramType")
    .first()
    .text()
    .trim();
  const lower = labelText.toLowerCase();
  if (lower.includes("cellar collection")) return "cellar_collection";
  if (lower.includes("classics collection")) return "classics_collection";
  if (lower.includes("special offer")) return "special_offers";
  if (lower.includes("bordeaux future")) return "bordeaux_futures";
  return "unknown";
}

/**
 * Extract a descriptive program label. Tries:
 *   1. #ctl00_ContentMain_lblPublishedNotes — sometimes contains a subtitle
 *   2. The labelProgramName text itself
 *   3. Falls back to null
 */
function extractProgramLabel($: cheerio.CheerioAPI): string | null {
  const notes = $("#ctl00_ContentMain_lblPublishedNotes").first().text().trim();
  if (notes.length > 4) return notes;
  const typeLabel = $(".labelProgramName, #ctl00_ContentMain_LabelProgramType").first().text().trim();
  if (typeLabel.length > 0) return typeLabel;
  return null;
}

const WAYBACK_MONTH_NAMES: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April",
  "05": "May", "06": "June", "07": "July", "08": "August",
  "09": "September", "10": "October", "11": "November", "12": "December",
};

/**
 * Derive release_month from a Wayback timestamp (YYYYMMDDHHMMSS).
 * Since the snapshot was taken while the program was OPEN, the month of the
 * snapshot is the same month as the release (±1 week at most).
 * Always marked inferred=true because it's derived from archive date, not page content.
 */
function releaseMonthFromTimestamp(timestamp: string): { release_month: string; inferred: boolean } {
  if (timestamp.length < 6) return { release_month: "", inferred: true };
  const year = timestamp.slice(0, 4);
  const mon  = timestamp.slice(4, 6);
  return { release_month: `${year}-${mon}`, inferred: true };
}

// ── Wine parsing ──────────────────────────────────────────────────────────────

export interface ArchiveDryRunWine {
  wine_name: string;
  wine_key: string;
  producer: string | null;
  lcbo_number: string | null;
  region: string | null;
  region_category: string;
  vintage: string | null;
  score: number | null;
  score_source: string | null;
  price: number | null;
}

/**
 * Parse wines from a program page. Mirrors scraper.ts parseWines() logic
 * but returns ArchiveDryRunWine[] and writes nothing.
 */
function parseArchiveWines($: cheerio.CheerioAPI): ArchiveDryRunWine[] {
  const wines: ArchiveDryRunWine[] = [];
  let currentGroup = "";

  $("table.myList tr").each((_, row) => {
    const $row = $(row);
    if ($row.hasClass("group")) { currentGroup = $row.text().trim(); return; }
    if (!$row.hasClass("item") && !$row.hasClass("itemAlt")) return;

    const tds = $row.find("td");
    if (tds.length < 4) return;

    const wineName = $row.find("span[id*='ProductName']").text().trim();
    if (!wineName) return;

    const lcboNumber = $row.find("span[id*='lblItemNumber']").text().trim() || null;
    const region = $(tds[2]).text().trim() || null;
    const scoreRaw = $(tds[3]).text().trim();
    const { score, score_source } = parseScore(scoreRaw);

    let priceRaw = $row.find(".colPricePerBottle").text().trim();
    if (!priceRaw) priceRaw = $(tds[tds.length - 1]).text().trim();
    const priceStr = priceRaw.replace(/[^0-9.]/g, "");
    const price = priceStr ? parseFloat(priceStr) : null;

    wines.push({
      wine_name: wineName,
      wine_key: generateWineKey(wineName),
      producer: extractProducer(wineName),
      lcbo_number: lcboNumber,
      region,
      region_category: categorizeRegion(region ?? "", currentGroup),
      vintage: extractVintage(wineName),
      score,
      score_source,
      price,
    });
  });

  return wines;
}

function hasMorePages($: cheerio.CheerioAPI): boolean {
  let found = false;
  $(".pagerButtonClass").each((_, el) => {
    if (found) return;
    const tag = (el as { name?: string }).name?.toLowerCase() ?? "";
    if (tag === "a") {
      const href = $(el).attr("href") ?? "";
      if (href.includes("__doPostBack")) found = true;
    }
  });
  return found;
}

// ── Public dry-run types ──────────────────────────────────────────────────────

export interface DryRunProgram {
  program_id: string;
  label: string;
  program_type: string;
  release_month: string | null;
  release_date_inferred: boolean;
  wayback_timestamp: string;
  wayback_snapshot_url: string;
  wine_count: number;
  has_more_pages: boolean;
  confidence: "high" | "low";
  confidence_notes: string[];
  sample_wines: ArchiveDryRunWine[];
}

export interface DryRunSkipped {
  program_id: string;
  reason: "no_wayback_snapshot" | "fetch_error" | "empty" | "low_confidence";
  detail?: string;
}

export interface DryRunResult {
  scanned: number;
  would_import: number;
  skipped_no_snapshot: number;
  skipped_empty: number;
  skipped_fetch_error: number;
  skipped_low_confidence: number;
  programs: DryRunProgram[];
  skipped: DryRunSkipped[];
}

// ── Main dry-run function ─────────────────────────────────────────────────────

/**
 * Scan program IDs [from, to] inclusive using Wayback Machine snapshots.
 * Writes nothing to any database table.
 * Returns a full dry-run report for admin review.
 *
 * Phase 1: one CDX bulk query builds a programId → snapshot lookup table.
 * Phase 2: for each ID in [from, to] that has a snapshot, fetch + parse.
 */
export async function dryRunArchiveScrape(from: number, to: number): Promise<DryRunResult> {
  const programs: DryRunProgram[] = [];
  const skipped: DryRunSkipped[] = [];

  // ── Phase 1: build CDX lookup (one request for all archived IDs) ──────────
  logger.info({ from, to }, "archive dry-run: fetching CDX index");
  let cdxLookup: CdxLookup;
  try {
    cdxLookup = await buildCdxLookup();
  } catch (err: any) {
    throw new Error(`CDX bulk query failed: ${err.message}`);
  }
  logger.info({ totalIndexed: cdxLookup.size }, "archive dry-run: CDX index ready");

  // ── Phase 2: process each ID in range ─────────────────────────────────────
  for (let id = from; id <= to; id++) {
    const programId = String(id);

    // ── 1. Look up snapshots from CDX table ─────────────────────────────────
    const cdxEntries = cdxLookup.get(programId);
    if (!cdxEntries || cdxEntries.length === 0) {
      skipped.push({ program_id: programId, reason: "no_wayback_snapshot" });
      continue;
    }

    // Try snapshots latest→earliest (up to 3) — earlier crawls are often
    // pre-wine-load; the latest is most likely to have wine data.
    const MAX_TRIES = 3;
    const toTry = cdxEntries.slice().reverse().slice(0, MAX_TRIES);
    logger.info({ programId, snapshots: cdxEntries.length }, "archive dry-run: trying snapshots");

    // ── 2. Fetch snapshots until we find one with wine rows ──────────────────
    let activeSnapshot: WaybackSnapshot | null = null;
    let active$: ReturnType<typeof cheerio.load> | null = null;
    let activeWines: ArchiveDryRunWine[] = [];
    let allEmpty = true;
    let lastFetchError: string | null = null;

    for (const entry of toTry) {
      const snap = snapshotFromCdx(entry);
      let html: string;
      try {
        html = await fetchHtml(snap.rawUrl);
        await sleep(FETCH_DELAY_MS);
      } catch (err: any) {
        lastFetchError = err.message;
        logger.warn({ programId, ts: snap.timestamp, err: err.message }, "archive dry-run: snapshot fetch failed");
        continue;
      }
      const $parsed = cheerio.load(html);
      const wines = parseArchiveWines($parsed);
      if (wines.length > 0) {
        activeSnapshot = snap;
        active$ = $parsed;
        activeWines = wines;
        allEmpty = false;
        break;
      }
      logger.info({ programId, ts: snap.timestamp }, "archive dry-run: snapshot empty, trying next");
    }

    if (!activeSnapshot || !active$) {
      if (lastFetchError && activeWines.length === 0 && allEmpty) {
        skipped.push({ program_id: programId, reason: "fetch_error", detail: lastFetchError });
      } else {
        skipped.push({
          program_id: programId,
          reason: "empty",
          detail: `All ${toTry.length} snapshot(s) tried had 0 wine rows`,
        });
      }
      continue;
    }

    // ── 4. Extract metadata ─────────────────────────────────────────────────
    const snapshot = activeSnapshot;
    const $ = active$;
    const wines = activeWines;
    const programType = extractProgramType($);
    const rawLabel    = extractProgramLabel($);
    const { release_month, inferred } = releaseMonthFromTimestamp(snapshot.timestamp);
    const morePages = hasMorePages($);

    const confidenceNotes: string[] = [];
    let confidence: "high" | "low" = "high";

    if (programType === "unknown") {
      confidenceNotes.push("program type not identified from labelProgramName element");
      confidence = "low";
    }
    if (inferred) {
      confidenceNotes.push(`release_month ${release_month} inferred from Wayback snapshot date — not read from page`);
    }
    const winesWithPrice = wines.filter((w) => w.price !== null && w.price > 0);
    if (winesWithPrice.length === 0) {
      confidenceNotes.push("no wine prices found — snapshot may be incomplete");
      confidence = "low";
    }

    const monthName = WAYBACK_MONTH_NAMES[release_month.slice(5, 7)] ?? "";
    const year = release_month.slice(0, 4);
    // Generic type labels (e.g. "Classics Collection") get a month suffix appended.
    // Only a more-specific string (e.g. a named program subtitle) is used as-is.
    const GENERIC_LABELS = ["classics collection", "cellar collection", "special offers", "bordeaux futures"];
    const isGeneric = !rawLabel || GENERIC_LABELS.includes(rawLabel.toLowerCase());
    const label = isGeneric
      ? programType !== "unknown"
        ? `${rawLabel ?? programType}: ${monthName} ${year}`
        : `Program ${programId}`
      : rawLabel;

    if (confidence === "low") {
      skipped.push({
        program_id: programId,
        reason: "low_confidence",
        detail: confidenceNotes.join("; "),
      });
      logger.info({ programId, confidenceNotes }, "archive dry-run: low confidence");
      await sleep(FETCH_DELAY_MS);
      continue;
    }

    programs.push({
      program_id: programId,
      label,
      program_type: programType,
      release_month,
      release_date_inferred: inferred,
      wayback_timestamp: snapshot.timestamp,
      wayback_snapshot_url: snapshot.snapshotUrl,
      wine_count: wines.length,
      has_more_pages: morePages,
      confidence,
      confidence_notes: confidenceNotes,
      sample_wines: wines.slice(0, 5),
    });

    logger.info({ programId, label, programType, wineCount: wines.length, snapshot: snapshot.timestamp }, "archive dry-run: would import");
    await sleep(FETCH_DELAY_MS);
  }

  const skippedNoSnapshot  = skipped.filter((s) => s.reason === "no_wayback_snapshot").length;
  const skippedEmpty       = skipped.filter((s) => s.reason === "empty").length;
  const skippedFetchError  = skipped.filter((s) => s.reason === "fetch_error").length;
  const skippedLowConf     = skipped.filter((s) => s.reason === "low_confidence").length;

  return {
    scanned:                  to - from + 1,
    would_import:             programs.length,
    skipped_no_snapshot:      skippedNoSnapshot,
    skipped_empty:            skippedEmpty,
    skipped_fetch_error:      skippedFetchError,
    skipped_low_confidence:   skippedLowConf,
    programs,
    skipped,
  };
}

// ── Closing date extraction ────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

/**
 * Extract a closing date string (YYYY-MM-DD) from program notes/label text.
 * Looks for patterns like "Offer closes October 20th, 2022" or "Order by Nov 3rd".
 */
function extractClosingDate(text: string): string | null {
  const m = text.match(
    /(?:offer\s+closes?|order\s+by|deadline)[^\w]*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/i,
  );
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// ── Import job state ──────────────────────────────────────────────────────────

export interface ImportJobState {
  status: "idle" | "running" | "done" | "error";
  from?: number;
  to?: number;
  started_at?: string;
  finished_at?: string;
  imported: number;
  skipped_existing: number;
  skipped_no_snapshot: number;
  skipped_empty: number;
  skipped_low_confidence: number;
  errors: Array<{ program_id: string; message: string }>;
  current_id?: number;
}

let _importJob: ImportJobState = {
  status: "idle",
  imported: 0,
  skipped_existing: 0,
  skipped_no_snapshot: 0,
  skipped_empty: 0,
  skipped_low_confidence: 0,
  errors: [],
};

export function getImportJobState(): ImportJobState {
  return { ..._importJob, errors: [..._importJob.errors] };
}

// ── Archive import ─────────────────────────────────────────────────────────────

/**
 * Import historical archive programs for IDs [from, to] into archive_release_cycles
 * and archive_wines. Writes ONLY to archive tables — never touches live tables.
 *
 * Idempotent: programs already in archive_release_cycles are skipped.
 * Runs as a background job — call startImportJob() from the route handler
 * and poll getImportJobState() for progress.
 */
export async function importArchiveRange(from: number, to: number): Promise<void> {
  _importJob = {
    status: "running",
    from,
    to,
    started_at: new Date().toISOString(),
    imported: 0,
    skipped_existing: 0,
    skipped_no_snapshot: 0,
    skipped_empty: 0,
    skipped_low_confidence: 0,
    errors: [],
  };

  logger.info({ from, to }, "archive import: job started");

  // ── Phase 1: CDX bulk lookup ────────────────────────────────────────────────
  let cdxLookup: CdxLookup;
  try {
    cdxLookup = await buildCdxLookup();
  } catch (err: any) {
    _importJob.status = "error";
    _importJob.finished_at = new Date().toISOString();
    _importJob.errors.push({ program_id: "CDX", message: err.message });
    logger.error({ err }, "archive import: CDX lookup failed");
    return;
  }

  // ── Phase 2: process each ID ────────────────────────────────────────────────
  for (let id = from; id <= to; id++) {
    const programId = String(id);
    _importJob.current_id = id;

    // Skip if already imported (idempotent)
    const existing = await db
      .select({ id: archiveReleaseCyclesTable.id })
      .from(archiveReleaseCyclesTable)
      .where(eq(archiveReleaseCyclesTable.program_id, programId))
      .limit(1);
    if (existing.length > 0) {
      _importJob.skipped_existing++;
      logger.info({ programId }, "archive import: already imported, skipping");
      continue;
    }

    // Check CDX lookup
    const cdxEntries = cdxLookup.get(programId);
    if (!cdxEntries || cdxEntries.length === 0) {
      _importJob.skipped_no_snapshot++;
      continue;
    }

    // Try snapshots latest→earliest (up to 3)
    const MAX_TRIES = 3;
    const toTry = cdxEntries.slice().reverse().slice(0, MAX_TRIES);

    let activeSnapshot: WaybackSnapshot | null = null;
    let active$: ReturnType<typeof cheerio.load> | null = null;
    let activeWines: ArchiveDryRunWine[] = [];
    let lastFetchError: string | null = null;

    for (const entry of toTry) {
      const snap = snapshotFromCdx(entry);
      let html: string;
      try {
        html = await fetchHtml(snap.rawUrl);
        await sleep(FETCH_DELAY_MS);
      } catch (err: any) {
        lastFetchError = err.message;
        continue;
      }
      const $parsed = cheerio.load(html);
      const wines = parseArchiveWines($parsed);
      if (wines.length > 0) {
        activeSnapshot = snap;
        active$ = $parsed;
        activeWines = wines;
        break;
      }
    }

    if (!activeSnapshot || !active$) {
      if (lastFetchError) {
        _importJob.errors.push({ program_id: programId, message: lastFetchError });
      } else {
        _importJob.skipped_empty++;
      }
      continue;
    }

    // Extract metadata
    const $ = active$;
    const wines = activeWines;
    const snapshot = activeSnapshot;

    const programType = extractProgramType($);
    const rawLabel    = extractProgramLabel($);
    const { release_month, inferred } = releaseMonthFromTimestamp(snapshot.timestamp);
    const closingDate = rawLabel ? extractClosingDate(rawLabel) : null;

    const confidenceNotes: string[] = [];
    let confidence: "high" | "low" = "high";
    if (programType === "unknown") {
      confidenceNotes.push("program type not identified");
      confidence = "low";
    }
    if (inferred) {
      confidenceNotes.push(`release_month ${release_month} inferred from snapshot date`);
    }
    if (wines.filter((w) => w.price !== null && w.price > 0).length === 0) {
      confidenceNotes.push("no wine prices found");
      confidence = "low";
    }

    if (confidence === "low") {
      _importJob.skipped_low_confidence++;
      logger.info({ programId, confidenceNotes }, "archive import: low confidence, skipping");
      continue;
    }

    const monthName = WAYBACK_MONTH_NAMES[release_month.slice(5, 7)] ?? "";
    const year = release_month.slice(0, 4);
    const GENERIC_LABELS = ["classics collection", "cellar collection", "special offers", "bordeaux futures"];
    const isGeneric = !rawLabel || GENERIC_LABELS.includes(rawLabel.toLowerCase());
    const fullLabel = isGeneric
      ? programType !== "unknown"
        ? `${rawLabel ?? programType}: ${monthName} ${year}`
        : `Program ${programId}`
      : rawLabel;
    // Truncate label to 200 chars for DB storage
    const programLabel = fullLabel.length > 200 ? fullLabel.slice(0, 197) + "…" : fullLabel;

    // ── Write to archive tables ─────────────────────────────────────────────
    try {
      const [inserted] = await db
        .insert(archiveReleaseCyclesTable)
        .values({
          program_id: programId,
          program_label: programLabel,
          program_type: programType,
          release_month: release_month || null,
          release_date_inferred: inferred,
          closing_date: closingDate,
          source_url: snapshot.snapshotUrl,
          confidence,
        })
        .returning({ id: archiveReleaseCyclesTable.id });

      if (wines.length > 0) {
        await db.insert(archiveWinesTable).values(
          wines.map((w) => ({
            archive_cycle_id: inserted.id,
            wine_name: w.wine_name,
            wine_key: w.wine_key ?? null,
            producer: w.producer ?? null,
            lcbo_number: w.lcbo_number ?? null,
            region: w.region ?? null,
            region_category: w.region_category,
            vintage: w.vintage ?? null,
            score: w.score !== null ? String(w.score) : null,
            score_source: w.score_source ?? null,
            price: w.price !== null ? String(w.price) : null,
            source_url: snapshot.snapshotUrl,
          })),
        );
      }

      _importJob.imported++;
      logger.info(
        { programId, programLabel, programType, wineCount: wines.length, snapshot: snapshot.timestamp },
        "archive import: inserted",
      );
    } catch (err: any) {
      _importJob.errors.push({ program_id: programId, message: err.message });
      logger.error({ programId, err }, "archive import: DB insert failed");
    }

    await sleep(FETCH_DELAY_MS);
  }

  _importJob.status = _importJob.errors.length > 0 ? "done" : "done";
  _importJob.finished_at = new Date().toISOString();
  _importJob.current_id = undefined;
  logger.info(
    { imported: _importJob.imported, skippedExisting: _importJob.skipped_existing, errors: _importJob.errors.length },
    "archive import: job complete",
  );
}
