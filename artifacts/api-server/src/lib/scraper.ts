import * as cheerio from "cheerio";
import { db, releaseCyclesTable, winesTable, watchlistItemsTable, watchlistCategoriesTable, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
}

export interface ScraperResult {
  message: string;
  wines_found: number;
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
 * Compute the Thursday of this week (or today if Thursday) at 8:30am Eastern.
 * 8:30am EST = 13:30 UTC. Returns null for preview programs.
 */
function computeReleaseOpensAt(status: "preview" | "available"): Date | null {
  if (status !== "available") return null;
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu
  const daysToThursday = utcDay <= 4 ? 4 - utcDay : 11 - utcDay;
  const thursday = new Date(now);
  thursday.setUTCDate(thursday.getUTCDate() + daysToThursday);
  thursday.setUTCHours(13, 30, 0, 0); // 8:30am EST = 13:30 UTC
  return thursday;
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

async function scrapeProgram(info: ProgramInfo): Promise<{ wines: ScrapedWine[]; pages: number; errors: string[] }> {
  const url = `${BASE}/Public/OrderProgramProducts.aspx?programId=${info.programId}&lang=en`;
  const wines: ScrapedWine[] = [];
  const errors: string[] = [];

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err: any) {
    return { wines, pages: 0, errors: [`Fetch failed: ${err.message}`] };
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

  return { wines, pages: currentPage, errors };
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

async function runMatchingEngine(insertedWines: InsertedWine[]): Promise<number> {
  const watchlistItems = await db.select().from(watchlistItemsTable);
  const categoryItems = await db.select().from(watchlistCategoriesTable);
  let matched = 0;

  for (const wine of insertedWines) {
    // Wine-level matching
    for (const item of watchlistItems) {
      let matches = false;
      if (item.match_type === "producer") {
        if (wine.producer && item.producer) {
          matches =
            wine.producer.toLowerCase().includes(item.producer.toLowerCase()) ||
            item.producer.toLowerCase().includes(wine.producer.toLowerCase());
        }
      } else {
        const nameHit =
          wine.wine_name.toLowerCase().includes(item.wine_name.toLowerCase()) ||
          item.wine_name.toLowerCase().includes(wine.wine_name.toLowerCase());
        if (nameHit) {
          matches = item.match_type === "wine" || !item.vintage || wine.vintage === item.vintage;
        }
      }

      if (matches) {
        try {
          await db
            .insert(alertsTable)
            .values({ user_id: item.user_id, wine_id: wine.id, wine_name: wine.wine_name, sent: false })
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
          .values({ user_id: catItem.user_id, wine_id: wine.id, wine_name: wine.wine_name, sent: false })
          .onConflictDoNothing();
        matched++;
      } catch {
        // ignore duplicate conflicts
      }
    }
  }

  return matched;
}

export async function runScraper(options: { force?: boolean } = {}): Promise<ScraperResult> {
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

    if (existing.length > 0) {
      if (!options.force) {
        logger.info({ programId: info.programId }, "Already scraped, skipping");
        summaries.push({ programId: info.programId, label: info.label, pages: 0, wines: 0, skipped: true, errors: [], sample: [] });
        continue;
      }
      logger.info({ programId: info.programId, cycleId: existing[0].id }, "Force mode: deleting existing data");
      await db.delete(winesTable).where(eq(winesTable.release_cycle_id, existing[0].id));
      await db.delete(releaseCyclesTable).where(eq(releaseCyclesTable.id, existing[0].id));
    }

    const { wines, pages, errors } = await scrapeProgram(info);
    logger.info({ programId: info.programId, wines: wines.length, pages }, "Program scraped");

    if (wines.length === 0) {
      summaries.push({ programId: info.programId, label: info.label, pages, wines: 0, skipped: false, errors: errors.length ? errors : ["No wines found"], sample: [] });
      continue;
    }

    const releaseOpensAt = computeReleaseOpensAt(info.status);

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
          sold_out: false,
        })
        .returning();
      inserted.push({ id: row.id, wine_name: row.wine_name, producer: row.producer, vintage: row.vintage, region: row.region, region_category: row.region_category });
    }

    const alertsQueued = await runMatchingEngine(inserted);
    totalAlertsMatched += alertsQueued;
    logger.info({ programId: info.programId, alertsQueued }, "Matching engine done");

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

  // Send announcement alerts for all newly matched wines
  if (totalAlertsMatched > 0) {
    try {
      const { sendPendingAlerts } = await import("./email.js");
      const { sent } = await sendPendingAlerts();
      logger.info({ sent }, "Announcement alerts dispatched after scrape");
    } catch (err) {
      logger.error({ err }, "Failed to send announcement alerts after scrape");
    }
  }

  logger.info({ totalWines, programs: programs.length, totalAlertsMatched }, "Scraper run complete");
  return {
    message: `Scraped ${programs.length} programs, inserted ${totalWines} wines`,
    wines_found: totalWines,
    programs: summaries,
  };
}
