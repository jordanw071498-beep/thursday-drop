import * as cheerio from "cheerio";
import { db, releaseCyclesTable, winesTable, watchlistItemsTable, watchlistCategoriesTable, alertsTable, historicalReleaseObservationsTable } from "@workspace/db";
import { upsertSuggestions } from "./suggestions.js";
import { eq, inArray, and } from "drizzle-orm";
import { logger } from "./logger.js";

const BASE = "https://www.vintagesshoponline.com/vintages";
const UA = "Mozilla/5.0 (compatible; ThursdayDropBot/1.0; +https://thursdaydrop.ca)";

const INDEX_PAGES = [
  { url: `${BASE}/ClassicsCollection.aspx`, type: "monthly_collection" },
  { url: `${BASE}/SpecialOffer.aspx`, type: "special_offers" },
  { url: `${BASE}/BordeauxFuture.aspx`, type: "bordeaux_futures" },
];

interface ProgramInfo {
  programId: string;
  label: string;
  type: string;
  closingDate: string | null;
  displayOrder: number;
  status: "preview" | "available";
}

interface ScrapedWine {
  wine_name: string;
  wine_key: string;
  producer: string | null;
  lcbo_number: string | null;
  region: string | null;
  region_category: string;
  vintage: string | null;
  score: string | null;
  score_source: string | null;
  price: string | null;
  qty_available: number | null;
  closing_date: string | null;
  buy_url: string | null;
  bottle_size: string | null;
}

export interface ScraperResult {
  message: string;
  wines_found: number;
  alerts_matched: number;
  alerts_suppressed: boolean;
  programs: Array<{
    programId: string;
    label: string;
    pages: number;
    wines: number;
    skipped: boolean;
    errors: string[];
    sample: string[];
  }>;
}

async function fetchHtml(url: string, options?: RequestInit): Promise<string> {
  const resp = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-CA,en;q=0.9",
      ...(options?.headers as Record<string, string> ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  return resp.text();
}

function extractVintage(name: string): string | null {
  const m = name.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? m[0] : null;
}

function parseScore(raw: string): { score: string | null; score_source: string | null } {
  const m = raw.trim().match(/^(\d+)\s*\(([^)]+)\)$/);
  if (m) return { score: m[1], score_source: m[2] };
  const n = raw.trim().match(/^(\d{2,3})$/);
  if (n) return { score: n[1], score_source: null };
  return { score: null, score_source: null };
}

function categorizeRegion(region: string, countryGroup: string): string {
  const t = `${region} ${countryGroup}`.toLowerCase();
  if (/burgundy|bourgogne|chablis|c[oô]te[- ]d['']or|c[oô]te de nuits|c[oô]te de beaune|m[aâ]con|meursault|puligny|chassagne|gevrey|chambolle|vosne|nuits|pommard|volnay|beaune|mercurey|rully|givry|montagny/.test(t)) return "burgundy";
  if (/bordeaux|m[eé]doc|pauillac|saint-[eé]milion|saint-estèphe|margaux|pomerol|graves|sauternes|barsac|listrac|moulis|haut-m[eé]doc/.test(t)) return "bordeaux";
  if (/rh[oô]ne|ch[aâ]teauneuf|hermitage|crozes|gigondas|vacqueyras|c[oô]tes du rh[oô]ne|cornas|saint-joseph|condrieu|c[oô]te-r[oô]tie|lirac/.test(t)) return "rhone";
  if (/champagne/.test(t)) return "champagne";
  if (/italy|italia|tuscany|toscana|piedmont|piemonte|veneto|barolo|barbaresco|brunello|chianti|amarone|prosecco|sicil|sardini|emilia|friuli|lombardy/.test(t)) return "italy";
  return "other";
}

/**
 * Normalize a raw volume string (e.g. "750 mL", "1.5 L", "375ml") to a
 * canonical form used consistently across the live and archive tables.
 * Returns null if the string does not contain a recognizable volume.
 * Never defaults to 750 mL — only returns non-null when the source is explicit.
 */
function normalizeBottleSize(raw: string): string | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|mL|L|l)\b/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(",", "."));
  const unit = m[2].toLowerCase();
  const ml = unit === "l" ? val * 1000 : val;
  if (ml === 187)   return "187 mL";
  if (ml === 200)   return "200 mL";
  if (ml === 250)   return "250 mL";
  if (ml === 375)   return "375 mL";
  if (ml === 500)   return "500 mL";
  if (ml === 750)   return "750 mL";
  if (ml === 1000)  return "1 L";
  if (ml === 1500)  return "1.5 L";
  if (ml === 2000)  return "2 L";
  if (ml === 3000)  return "3 L";
  if (ml === 6000)  return "6 L";
  if (ml === 9000)  return "9 L";
  if (ml === 12000) return "12 L";
  if (unit === "l") return `${val} L`;
  return `${val} mL`;
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

/**
 * Compute a release_opens_at timestamp from program status.
 *
 * Vintages release cycle:
 *   - Thursday N   : wines posted as "preview"
 *   - Thursday N+1 : ordering opens at 8:30am ET ("available")
 *
 * For "preview" we infer the FOLLOWING Thursday (N+1) at 8:30am ET so that the
 * morning-reminder query (which filters by release_opens_at = today) fires
 * correctly at 7:00am on the day ordering opens — one week later.
 *
 * For "available" we use the current/upcoming Thursday at 8:30am ET (or today
 * if the status just transitioned and today is Thursday).
 *
 * 8:30am EDT (summer) = 12:30 UTC. 8:30am EST (winter) = 13:30 UTC.
 */
function computeReleaseOpensAt(status: "preview" | "available"): Date {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat

  if (status === "preview") {
    // "Next Thursday" = most recent Thursday + 7 days.
    // daysSinceThursday: 0 if today is Thu, 1 if Fri, …, 6 if Wed.
    const daysSinceThursday = ((utcDay - 4) + 7) % 7;
    const nextThursday = new Date(now);
    nextThursday.setUTCDate(nextThursday.getUTCDate() - daysSinceThursday + 7);
    const month = nextThursday.getUTCMonth();
    const offsetHours = month >= 3 && month <= 9 ? 4 : 5;
    nextThursday.setUTCHours(8 + offsetHours, 30, 0, 0);
    return nextThursday;
  }

  // "available": upcoming Thursday at 8:30am ET (or today if today is Thursday)
  const daysToThursday = utcDay <= 4 ? 4 - utcDay : 11 - utcDay;
  const thursday = new Date(now);
  thursday.setUTCDate(thursday.getUTCDate() + daysToThursday);
  const month = thursday.getUTCMonth();
  const offsetHours = month >= 3 && month <= 9 ? 4 : 5;
  thursday.setUTCHours(8 + offsetHours, 30, 0, 0);
  return thursday;
}

/**
 * Parse a release date from Vintages page HTML.
 * Looks for text like "goes live for ordering on June 11, 2026 08:30"
 * and converts from Eastern time to UTC.
 */
function parseReleaseOpensAt(html: string): Date | null {
  const m = html.match(
    /(?:goes live for ordering on|available for ordering on|ordering opens on)\s+([A-Z][a-z]+\s+\d+,\s*\d{4}\s+\d+:\d+)/i,
  );
  if (!m) return null;
  const dateStr = m[1].trim();
  const parts = dateStr.match(/(\w+)\s+(\d+),\s*(\d{4})\s+(\d+):(\d+)/);
  if (!parts) return null;

  const MONTHS: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };
  const month = MONTHS[parts[1]];
  if (month === undefined) return null;

  const day = parseInt(parts[2]);
  const year = parseInt(parts[3]);
  const hour = parseInt(parts[4]);
  const minute = parseInt(parts[5]);

  // EDT (UTC-4) April–October, EST (UTC-5) November–March
  const offsetHours = month >= 3 && month <= 9 ? 4 : 5;
  return new Date(Date.UTC(year, month, day, hour + offsetHours, minute, 0, 0));
}

function extractFormFields($: cheerio.CheerioAPI): Record<string, string> {
  const fields: Record<string, string> = {};
  $("input[type=hidden]").each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value") ?? "";
    if (name) fields[name] = value;
  });
  return fields;
}

function parseWines($: cheerio.CheerioAPI, programId: string, closingDate: string | null): ScrapedWine[] {
  const wines: ScrapedWine[] = [];
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
    // Volume extraction: the LCBO Vintages table layout is:
    //   td[0]=product (name, LCBO#, tooltip), td[1]=LCBO item#, td[2]=region,
    //   td[3]=score, td[4]=bare volume number ("750"), td[5]=price
    // The most reliable source is the TooltipWording span inside td[0], whose text
    // contains the full "750 mL" string with unit (e.g. "14% Alc./Vol. 750 mL").
    // Fallback: td[4] contains a bare integer ("750") so we append " mL" before parsing.
    const tooltipText = $row.find("span[id*='TooltipWording']").text();
    const volCellRaw = tds.length > 4 ? $(tds[4]).text().trim() : "";
    const volCellWithUnit = volCellRaw.match(/^\d+$/) ? `${volCellRaw} mL` : volCellRaw;
    const bottle_size =
      normalizeBottleSize(tooltipText) ??
      normalizeBottleSize(volCellWithUnit) ??
      normalizeBottleSize($row.find("span[id*='lblVolume'], .colVolume").first().text().trim());
    const region = $(tds[2]).text().trim() || null;
    const scoreRaw = $(tds[3]).text().trim();
    const { score, score_source } = parseScore(scoreRaw);

    let priceRaw = $row.find(".colPricePerBottle").text().trim();
    if (!priceRaw) priceRaw = $(tds[tds.length - 1]).text().trim();
    const price = priceRaw.replace(/[^0-9.]/g, "") || null;

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
      qty_available: null,
      closing_date: closingDate,
      buy_url: `https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=${programId}&lang=en`,
      bottle_size: bottle_size ?? null,
    });
  });

  return wines;
}

function findNextPageLink($: cheerio.CheerioAPI, currentPage: number): string | null {
  const exact = $(`a.pagerButtonClass[aria-label="Page ${currentPage + 1}"]`);
  if (exact.length > 0) {
    const href = exact.first().attr("href") ?? "";
    if (href.includes("__doPostBack")) return href;
  }

  let pastActive = false;
  let found: string | null = null;
  $(".pagerButtonClass").each((_, el) => {
    if (found) return;
    const tag = (el as { name?: string }).name?.toLowerCase() ?? "";
    if (tag === "span") { pastActive = true; return; }
    if (pastActive && tag === "a") {
      const href = $(el).attr("href") ?? "";
      if (href.includes("__doPostBack")) found = href;
    }
  });
  return found;
}

async function scrapeProgram(info: ProgramInfo): Promise<{ wines: ScrapedWine[]; pages: number; errors: string[]; releaseOpensAt: Date | null }> {
  const url = `${BASE}/Public/OrderProgramProducts.aspx?programId=${info.programId}&lang=en`;
  const wines: ScrapedWine[] = [];
  const errors: string[] = [];

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err: any) {
    return { wines, pages: 0, errors: [`Fetch failed: ${err.message}`], releaseOpensAt: null };
  }

  // Try to parse the actual release date from the page before falling back to computed date
  const releaseOpensAt = parseReleaseOpensAt(html);
  if (releaseOpensAt) {
    logger.info({ programId: info.programId, releaseOpensAt }, "Parsed release date from page");
  }

  let $ = cheerio.load(html);
  let formFields = extractFormFields($);
  const p1 = parseWines($, info.programId, info.closingDate);
  wines.push(...p1);
  logger.info({ programId: info.programId, page: 1, wines: p1.length }, "Page scraped");

  let currentPage = 1;
  while (currentPage < 60) {
    const nextHref = findNextPageLink($, currentPage);
    if (!nextHref) break;
    const m = nextHref.match(/__doPostBack\('([^']+)','([^']*)'\)/);
    if (!m) break;

    try {
      const body = new URLSearchParams({
        ...formFields,
        __EVENTTARGET: m[1],
        __EVENTARGUMENT: m[2],
      });
      const pageHtml = await fetchHtml(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: url },
        body: body.toString(),
      });
      $ = cheerio.load(pageHtml);
      formFields = { ...formFields, ...extractFormFields($) };
      const pageWines = parseWines($, info.programId, info.closingDate);
      wines.push(...pageWines);
      currentPage++;
      logger.info({ programId: info.programId, page: currentPage, wines: pageWines.length }, "Page scraped");
    } catch (err: any) {
      errors.push(`Page ${currentPage + 1}: ${err.message}`);
      logger.warn({ err, programId: info.programId, page: currentPage + 1 }, "Page scrape failed");
      break;
    }
  }

  return { wines, pages: currentPage, errors, releaseOpensAt };
}

async function discoverPrograms(): Promise<ProgramInfo[]> {
  const programs: ProgramInfo[] = [];
  const seen = new Set<string>();

  for (const page of INDEX_PAGES) {
    try {
      const html = await fetchHtml(page.url);
      const $ = cheerio.load(html);
      let position = 0;

      $("a[href*='OrderProgramProducts.aspx?programId=']").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const m = href.match(/programId=(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const $row = $(el).closest("tr");
        const rowText = $row.text().toUpperCase();
        const status: "preview" | "available" = rowText.includes("PREVIEW") ? "preview" : "available";
        const closingDate = $row.find("td").eq(1).text().trim() || null;

        programs.push({
          programId: m[1],
          label: $(el).text().trim(),
          type: page.type,
          closingDate,
          displayOrder: position++,
          status,
        });
      });

      logger.info({ url: page.url, found: position }, "Index page scraped");
    } catch (err) {
      logger.warn({ err, url: page.url }, "Index page failed");
    }
  }

  return programs;
}

type InsertedWine = {
  id: number;
  wine_name: string;
  wine_key?: string | null;
  producer: string | null;
  vintage: string | null;
  region: string | null;
  region_category: string | null;
};

const CATEGORY_MATCHERS: Record<string, (w: InsertedWine) => boolean> = {
  "Burgundy Grand Cru": (w) =>
    w.region_category === "burgundy" && /grand\s+cru/i.test(w.wine_name),
  "Burgundy Premier Cru": (w) =>
    w.region_category === "burgundy" && (/1er\s+cru|premier\s+cru/i.test(w.wine_name) || /premier\s+cru/i.test(w.region ?? "")),
  "Brunello di Montalcino": (w) =>
    /brunello/i.test(w.wine_name) || /montalcino/i.test(w.region ?? ""),
  "Barolo and Barbaresco": (w) =>
    /barolo|barbaresco/i.test(w.wine_name),
  "Bordeaux First Growths": (w) =>
    /ch[âa]teau\s+(margaux|latour|lafite|mouton|haut.brion|p[ée]trus|ausone|cheval\s+blanc)/i.test(w.wine_name),
  "Champagne Prestige Cuvée": (w) =>
    w.region_category === "champagne" && /cristal|dom\s+p[ée]rignon|belle\s+[ée]poque|clos\s+du\s+mesnil|substance|blanc\s+de\s+blancs|prestige/i.test(w.wine_name),
  "Napa Valley Cult Cabernet": (w) =>
    /napa/i.test(w.region ?? "") && /screaming\s+eagle|harlan|opus\s+one|dominus|peter\s+michael|bond\s+estate/i.test(w.wine_name),
  "Rhône Valley (Guigal La La wines)": (w) =>
    w.region_category === "rhone",
  "Super Tuscans": (w) =>
    w.region_category === "italy" && /sassicaia|ornellaia|masseto|tignanello|solaia|guado\s+al\s+tasso/i.test(w.wine_name),
  "Sauternes and Dessert wines": (w) =>
    /sauternes|d'yquem|yquem|beerenauslese|trockenbeerenauslese|eiswein|tokaj/i.test(w.wine_name) || /sauternes/i.test(w.region ?? ""),
};

/**
 * Normalize a string for fuzzy matching: decompose unicode, strip diacritics,
 * then lowercase. This ensures accented chars match their unaccented equivalents
 * regardless of which side (LCBO or user input) uses the accent.
 *
 * Examples: "Álvaro" → "alvaro", "Romanée" → "romanee", "Prieuré" → "prieure"
 */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")               // decompose é → e + combining accent
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritic marks
    .toLowerCase();
}

async function runMatchingEngine(insertedWines: InsertedWine[], isTest = false): Promise<number> {
  const watchlistItems = await db.select().from(watchlistItemsTable);
  const categoryItems = await db.select().from(watchlistCategoriesTable);
  let matched = 0;

  for (const wine of insertedWines) {
    // Wine-level matching
    for (const item of watchlistItems) {
      let matches = false;
      if (item.match_type === "producer") {
        if (wine.producer && item.producer) {
          const normWineProducer = normalizeForMatch(wine.producer);
          const normItemProducer = normalizeForMatch(item.producer);
          matches =
            normWineProducer.includes(normItemProducer) ||
            normItemProducer.includes(normWineProducer);
        }
      } else {
        const normWineName = normalizeForMatch(wine.wine_name);
        const normItemName = normalizeForMatch(item.wine_name);
        const nameHit =
          normWineName.includes(normItemName) ||
          normItemName.includes(normWineName);
        if (nameHit) {
          matches = item.match_type === "wine" || !item.vintage || wine.vintage === item.vintage;
        }
      }

      if (matches && item.user_id) {
        try {
          await db
            .insert(alertsTable)
            .values({ user_id: item.user_id, wine_id: wine.id, wine_name: wine.wine_name, is_test: isTest, alert_source: "scraper_match" })
            .onConflictDoNothing();
          matched++;
        } catch {
          // ignore duplicate conflicts
        }
      }
    }

    // Category-level matching
    for (const catItem of categoryItems) {
      const matcher = CATEGORY_MATCHERS[catItem.category];
      if (!matcher || !matcher(wine)) continue;
      try {
        await db
          .insert(alertsTable)
          .values({ user_id: catItem.user_id, wine_id: wine.id, wine_name: wine.wine_name, is_test: isTest, alert_source: "scraper_match" })
          .onConflictDoNothing();
        matched++;
      } catch {
        // ignore duplicate conflicts
      }
    }
  }

  return matched;
}

/**
 * When a user adds a new watchlist item, check all currently active wines and
 * queue announcement alerts for any that already match. Called immediately after
 * the watchlist item is inserted so late-joining users get notified.
 */
export async function queueAlertsForNewWatchlistItem(
  userId: string,
  item: { wine_name: string; producer: string | null; vintage: string | null; match_type: string },
): Promise<number> {
  const now = new Date();
  // A release is "active" for alert purposes when BOTH conditions hold:
  //   1. release_opens_at is within the last 14 days (excludes old archived offers)
  //   2. display_order < 500 (the scraper pushes programs that fall off the LCBO
  //      Vintages index page to display_order ≥ 500; those are effectively expired)
  // Using release_opens_at (a real timestamp) rather than closing_date (which contains
  // text strings like "PREVIEW" or "Available Now Online", never parseable as dates).
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const allCycles = await db.select().from(releaseCyclesTable);
  const activeCycleIds = allCycles
    .filter((c) => {
      if (!c.release_opens_at) return false; // no timestamp — skip (too old or preview-only)
      if ((c.display_order ?? 0) >= 500) return false; // fallen off LCBO Vintages index page
      return c.release_opens_at >= fourteenDaysAgo;
    })
    .map((c) => c.id);

  if (activeCycleIds.length === 0) return 0;

  const wines = await db
    .select({
      id: winesTable.id,
      wine_name: winesTable.wine_name,
      producer: winesTable.producer,
      vintage: winesTable.vintage,
      region: winesTable.region,
      region_category: winesTable.region_category,
    })
    .from(winesTable)
    .where(inArray(winesTable.release_cycle_id, activeCycleIds));

  let matched = 0;
  for (const wine of wines) {
    let matches = false;
    if (item.match_type === "producer") {
      if (wine.producer && item.producer) {
        const normWineProducer = normalizeForMatch(wine.producer);
        const normItemProducer = normalizeForMatch(item.producer);
        matches =
          normWineProducer.includes(normItemProducer) ||
          normItemProducer.includes(normWineProducer);
      }
    } else {
      const normWineName = normalizeForMatch(wine.wine_name);
      const normItemName = normalizeForMatch(item.wine_name);
      const nameHit =
        normWineName.includes(normItemName) ||
        normItemName.includes(normWineName);
      if (nameHit) {
        matches = item.match_type === "wine" || !item.vintage || wine.vintage === item.vintage;
      }
    }

    if (matches) {
      try {
        await db
          .insert(alertsTable)
          .values({ user_id: userId, wine_id: wine.id, wine_name: wine.wine_name, alert_source: "watchlist_add" })
          .onConflictDoNothing();
        matched++;
        logger.info({ userId, wineId: wine.id, wineName: wine.wine_name }, "Alert queued for late watchlist addition");
      } catch {
        // ignore duplicate conflicts
      }
    }
  }

  return matched;
}

/**
 * When a user adds a new category watchlist item, check all currently active wines
 * and queue announcement alerts for any that already match. Mirrors the behaviour of
 * queueAlertsForNewWatchlistItem so category and item watchlists are consistent.
 */
export async function queueAlertsForNewWatchlistCategory(
  userId: string,
  category: string,
): Promise<number> {
  const matcher = CATEGORY_MATCHERS[category];
  if (!matcher) return 0;

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const allCycles = await db.select().from(releaseCyclesTable);
  const activeCycleIds = allCycles
    .filter((c) => {
      if (!c.release_opens_at) return false;
      if ((c.display_order ?? 0) >= 500) return false;
      return c.release_opens_at >= fourteenDaysAgo;
    })
    .map((c) => c.id);

  if (activeCycleIds.length === 0) return 0;

  const wines = await db
    .select({
      id: winesTable.id,
      wine_name: winesTable.wine_name,
      producer: winesTable.producer,
      vintage: winesTable.vintage,
      region: winesTable.region,
      region_category: winesTable.region_category,
    })
    .from(winesTable)
    .where(inArray(winesTable.release_cycle_id, activeCycleIds));

  let matched = 0;
  for (const wine of wines) {
    if (!matcher(wine)) continue;
    try {
      await db
        .insert(alertsTable)
        .values({ user_id: userId, wine_id: wine.id, wine_name: wine.wine_name, alert_source: "watchlist_add" })
        .onConflictDoNothing();
      matched++;
      logger.info({ userId, wineId: wine.id, wineName: wine.wine_name, category }, "Alert queued for late category addition");
    } catch {
      // ignore duplicate conflicts
    }
  }

  return matched;
}

export async function runScraper(options: { force?: boolean; testMode?: boolean; suppressEmails?: boolean } = {}): Promise<ScraperResult> {
  logger.info({ force: options.force }, "Scraper run started");
  const summaries: ScraperResult["programs"] = [];
  let totalWines = 0;
  let totalAlertsMatched = 0;

  const programs = await discoverPrograms();
  logger.info({ count: programs.length }, "Programs discovered");

  for (const info of programs) {
    const existing = await db
      .select()
      .from(releaseCyclesTable)
      .where(eq(releaseCyclesTable.program_id, info.programId))
      .limit(1);

    // Tracks (user_id, wine_key) pairs that already received a sent announcement alert
    // for wines in this cycle. Populated before force-deletion so we can silence
    // duplicate alerts after re-import — prevents users being emailed twice for the
    // same wine just because force mode gave it a new DB id.
    let alreadyNotified: Array<{ userId: string; wineKey: string }> = [];

    if (existing.length > 0) {
      if (!options.force) {
        // Always refresh display_order and status for existing programs so the
        // page order stays in sync with the live Vintages index on every scrape.
        const statusChanged = existing[0].status !== info.status;
        const orderChanged = existing[0].display_order !== info.displayOrder;
        const labelChanged = existing[0].program_label !== info.label;
        if (statusChanged || orderChanged || labelChanged) {
          const releaseOpensAt = statusChanged ? computeReleaseOpensAt(info.status) : undefined;
          await db
            .update(releaseCyclesTable)
            .set({
              status: info.status,
              display_order: info.displayOrder,
              program_label: info.label,
              ...(releaseOpensAt ? { release_opens_at: releaseOpensAt } : {}),
            })
            .where(eq(releaseCyclesTable.id, existing[0].id));
          if (statusChanged) logger.info({ programId: info.programId, oldStatus: existing[0].status, newStatus: info.status }, "Program status updated");
          if (orderChanged) logger.info({ programId: info.programId, oldOrder: existing[0].display_order, newOrder: info.displayOrder }, "Program display_order updated");
          if (labelChanged) logger.info({ programId: info.programId, oldLabel: existing[0].program_label, newLabel: info.label }, "Program label updated");
        }
        logger.info({ programId: info.programId }, "Already scraped, skipping");
        summaries.push({ programId: info.programId, label: info.label, pages: 0, wines: 0, skipped: true, errors: [], sample: [] });
        continue;
      }
      logger.info({ programId: info.programId, cycleId: existing[0].id }, "Force mode: deleting existing data");

      const notifiedRaw = await db
        .select({ userId: alertsTable.user_id, wineKey: winesTable.wine_key })
        .from(alertsTable)
        .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
        .where(and(
          eq(winesTable.release_cycle_id, existing[0].id),
          eq(alertsTable.announcement_alert_sent, true),
        ));
      alreadyNotified = notifiedRaw.filter((r): r is { userId: string; wineKey: string } => r.wineKey !== null);
      if (alreadyNotified.length > 0) {
        logger.info({ programId: info.programId, pairs: alreadyNotified.length }, "Force mode: recorded already-notified (user, wine) pairs");
      }

      await db.delete(winesTable).where(eq(winesTable.release_cycle_id, existing[0].id));
      await db.delete(releaseCyclesTable).where(eq(releaseCyclesTable.id, existing[0].id));
    }

    const { wines, pages, errors, releaseOpensAt: parsedDate } = await scrapeProgram(info);
    logger.info({ programId: info.programId, wines: wines.length, pages }, "Program scraped");

    if (wines.length === 0) {
      summaries.push({ programId: info.programId, label: info.label, pages, wines: 0, skipped: false, errors: errors.length ? errors : ["No wines found"], sample: [] });
      continue;
    }

    // Use date parsed from the page; fall back to computing next Thursday
    const releaseOpensAt = parsedDate ?? computeReleaseOpensAt(info.status);

    const [cycle] = await db
      .insert(releaseCyclesTable)
      .values({
        program_id: info.programId,
        program_label: info.label,
        program_type: info.type,
        closing_date: info.closingDate,
        wine_count: wines.length,
        display_order: info.displayOrder,
        status: info.status,
        release_opens_at: releaseOpensAt,
      })
      .returning();

    const inserted: InsertedWine[] = [];

    for (const w of wines) {
      const [row] = await db
        .insert(winesTable)
        .values({
          release_cycle_id: cycle.id,
          wine_name: w.wine_name,
          wine_key: w.wine_key,
          producer: w.producer,
          lcbo_number: w.lcbo_number,
          region: w.region,
          region_category: w.region_category,
          vintage: w.vintage,
          score: w.score,
          score_source: w.score_source,
          price: w.price,
          qty_available: w.qty_available,
          closing_date: w.closing_date,
          buy_url: w.buy_url,
          bottle_size: w.bottle_size,
          sold_out: false,
        })
        .returning();
      inserted.push({ id: row.id, wine_name: row.wine_name, wine_key: row.wine_key, producer: row.producer, vintage: row.vintage, region: row.region, region_category: row.region_category });
    }

    // Append-only historical snapshot — one row per (wine_key, vintage, bottle_size, program_id).
    // Deduplicate within this batch first: ON CONFLICT DO NOTHING still errors if the same
    // unique key appears twice in a single VALUES list.
    const obsSourceUrl = `${BASE}/Public/OrderProgramProducts.aspx?programId=${info.programId}&lang=en`;
    const releaseMonth = `${releaseOpensAt.getUTCFullYear()}-${String(releaseOpensAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const releaseOpensAtText = releaseOpensAt.toISOString();

    const seenObsKeys = new Set<string>();
    const obsRows: (typeof historicalReleaseObservationsTable.$inferInsert)[] = [];
    for (const w of wines) {
      const obsKey = `${w.wine_key}||${w.vintage ?? ""}||${w.bottle_size ?? ""}||${info.programId}`;
      if (seenObsKeys.has(obsKey)) continue;
      seenObsKeys.add(obsKey);
      obsRows.push({
        wine_name:        w.wine_name,
        wine_key:         w.wine_key,
        producer:         w.producer,
        vintage:          w.vintage,
        bottle_size:      w.bottle_size,
        lcbo_number:      w.lcbo_number,
        price:            w.price,
        score:            w.score,
        score_source:     w.score_source,
        program_id:       info.programId,
        program_type:     info.type,
        program_label:    info.label,
        release_opens_at: releaseOpensAtText,
        release_month:    releaseMonth,
        closing_date:     info.closingDate,
        source_url:       obsSourceUrl,
        // confidence and source_method use schema defaults ('high', 'live_scrape')
      });
    }

    if (obsRows.length > 0) {
      try {
        await db
          .insert(historicalReleaseObservationsTable)
          .values(obsRows)
          .onConflictDoNothing();
        logger.info({ programId: info.programId, count: obsRows.length }, "Historical release observations recorded");
      } catch (err) {
        logger.error({ err, programId: info.programId }, "Failed to record historical release observations");
      }
    }

    // Populate suggestions table from newly scraped wines — fire-and-forget so
    // a suggestion failure never blocks the scrape or alert pipeline.
    upsertSuggestions(
      inserted.flatMap((w) => {
        const entries: Parameters<typeof upsertSuggestions>[0] = [
          { display_name: w.wine_name, wine_name: w.wine_name, producer: w.producer, type: "wine" },
        ];
        if (w.producer) {
          entries.push({ display_name: w.producer, wine_name: null, producer: w.producer, type: "producer" });
        }
        return entries;
      }),
      "scraped",
    ).catch((err) => logger.error({ err }, "Failed to upsert wine suggestions from scrape"));

    const alertsQueued = await runMatchingEngine(inserted, options.testMode ?? false);
    totalAlertsMatched += alertsQueued;
    logger.info({ programId: info.programId, alertsQueued }, "Matching engine done");

    // Silence duplicate alerts: for any (user, wine) that was already announced
    // before the force re-scrape, mark the newly-created alert as already-sent so
    // the alert flusher never picks it up and sends a second email.
    if (alreadyNotified.length > 0) {
      let silenced = 0;
      for (const wine of inserted) {
        for (const pair of alreadyNotified) {
          if (wine.wine_key && pair.wineKey === wine.wine_key) {
            await db
              .update(alertsTable)
              .set({ sent: true, sent_at: new Date(), announcement_alert_sent: true })
              .where(and(eq(alertsTable.wine_id, wine.id), eq(alertsTable.user_id, pair.userId)));
            silenced++;
          }
        }
      }
      if (silenced > 0) {
        logger.info({ programId: info.programId, silenced }, "Force mode: silenced duplicate alerts for already-notified (user, wine) pairs");
      }
    }

    totalWines += wines.length;
    summaries.push({
      programId: info.programId,
      label: info.label,
      pages,
      wines: wines.length,
      skipped: false,
      errors,
      sample: wines.slice(0, 3).map((w) => `${w.wine_name} | ${w.score ?? "—"} pts | $${w.price ?? "—"} | ${w.vintage ?? "NV"}`),
    });
  }

  // Reconcile display_order: programs no longer listed on the LCBO index (not
  // discovered in this run) get pushed to display_order ≥ 500 so they appear
  // after all currently-visible programs in every tab. The < 500 guard prevents
  // the offset from accumulating across repeated scrape runs.
  if (!options.force && programs.length > 0) {
    const discoveredIds = new Set(programs.map((p) => p.programId));
    const allCycles = await db
      .select({ id: releaseCyclesTable.id, program_id: releaseCyclesTable.program_id, display_order: releaseCyclesTable.display_order })
      .from(releaseCyclesTable);
    for (const cycle of allCycles) {
      if (!discoveredIds.has(cycle.program_id) && (cycle.display_order ?? 0) < 500) {
        await db
          .update(releaseCyclesTable)
          .set({ display_order: 500 + (cycle.display_order ?? 0) })
          .where(eq(releaseCyclesTable.id, cycle.id));
        logger.info({ programId: cycle.program_id }, "Pushed off-index program to end of display order");
      }
    }
  }

  // Force mode: prune release_cycles that weren't discovered in this run
  if (options.force && programs.length > 0) {
    const scrapedIds = new Set(programs.map((p) => p.programId));
    const allCycles = await db
      .select({ id: releaseCyclesTable.id, program_id: releaseCyclesTable.program_id })
      .from(releaseCyclesTable);
    for (const stale of allCycles.filter((c) => !scrapedIds.has(c.program_id))) {
      await db.delete(winesTable).where(eq(winesTable.release_cycle_id, stale.id));
      await db.delete(releaseCyclesTable).where(eq(releaseCyclesTable.id, stale.id));
      logger.info({ programId: stale.program_id, cycleId: stale.id }, "Force mode: pruned stale release cycle");
    }
  }

  // Send announcement alerts for all newly matched wines.
  // Skipped in: test mode, or when suppressEmails=true (admin silent re-scrape).
  const willSendEmails = totalAlertsMatched > 0 && !options.testMode && !options.suppressEmails;
  if (willSendEmails) {
    try {
      const { sendPendingAlerts } = await import("./email.js");
      const { sent } = await sendPendingAlerts();
      logger.info({ sent }, "Announcement alerts dispatched after scrape");
    } catch (err) {
      logger.error({ err }, "Failed to send announcement alerts after scrape");
    }
  } else if (totalAlertsMatched > 0 && options.suppressEmails) {
    logger.info({ totalAlertsMatched }, "Scrape complete — emails suppressed, alerts held as pending");
  }

  logger.info({ totalWines, programs: programs.length, totalAlertsMatched, suppressEmails: options.suppressEmails ?? false }, "Scraper run complete");
  return {
    message: `Scraped ${programs.length} programs, inserted ${totalWines} wines`,
    wines_found: totalWines,
    alerts_matched: totalAlertsMatched,
    alerts_suppressed: options.suppressEmails ?? false,
    programs: summaries,
  };
}
